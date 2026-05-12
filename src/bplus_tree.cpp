#include "minidb/bplus_tree.hpp"

#include "minidb/codec.hpp"

#include <algorithm>
#include <limits>
#include <sstream>

namespace minidb {
namespace {

constexpr std::size_t kNodeHeaderSize = 1 + sizeof(std::uint16_t) + sizeof(std::uint64_t) * 3;
constexpr std::size_t kMinLeafRecords = 2;
constexpr std::size_t kMaxKeySize = 1024;

std::size_t lower_bound_index(const std::vector<std::string>& keys, const std::string& key) {
    return static_cast<std::size_t>(std::lower_bound(keys.begin(), keys.end(), key) - keys.begin());
}

std::size_t upper_bound_index(const std::vector<std::string>& keys, const std::string& key) {
    return static_cast<std::size_t>(std::upper_bound(keys.begin(), keys.end(), key) - keys.begin());
}

void append_node_header(std::vector<std::uint8_t>& out, PageType type, std::uint16_t count,
                        PageId parent, PageId next, PageId prev) {
    codec::append_u8(out, static_cast<std::uint8_t>(type));
    codec::append_u16(out, count);
    codec::append_u64(out, parent);
    codec::append_u64(out, next);
    codec::append_u64(out, prev);
}

void require_valid_key(const std::string& key) {
    if (key.size() > kMaxKeySize) {
        throw DbException("key is too large; max key size is " + std::to_string(kMaxKeySize) + " bytes");
    }
}

} // namespace

BPlusTree::BPlusTree(PageManager& page_manager, BufferPool& buffer_pool, OverflowManager& overflow_manager)
    : page_manager_(page_manager), buffer_pool_(buffer_pool), overflow_manager_(overflow_manager) {
    ensure_root();
}

bool BPlusTree::put(const std::string& key, std::string value) {
    require_valid_key(key);
    ensure_root();

    Node leaf = find_leaf(key);
    std::size_t index = lower_bound_index(leaf.keys, key);
    ValueRef value_ref = make_value_ref(std::move(value));

    if (index < leaf.keys.size() && leaf.keys[index] == key) {
        leaf.values[index] = std::move(value_ref);
        write_node(leaf);
        return false;
    }

    leaf.keys.insert(leaf.keys.begin() + static_cast<std::ptrdiff_t>(index), key);
    leaf.values.insert(leaf.values.begin() + static_cast<std::ptrdiff_t>(index), std::move(value_ref));

    if (node_fits(leaf)) {
        write_node(leaf);
    } else {
        split_leaf(leaf);
    }
    page_manager_.increment_key_count();
    return true;
}

std::optional<std::string> BPlusTree::get(const std::string& key) {
    require_valid_key(key);
    ensure_root();
    Node leaf = find_leaf(key);
    std::size_t index = lower_bound_index(leaf.keys, key);
    if (index == leaf.keys.size() || leaf.keys[index] != key) {
        return std::nullopt;
    }
    return read_value(leaf.values[index]);
}

bool BPlusTree::remove(const std::string& key) {
    require_valid_key(key);
    ensure_root();
    Node leaf = find_leaf(key);
    std::size_t index = lower_bound_index(leaf.keys, key);
    if (index == leaf.keys.size() || leaf.keys[index] != key) {
        return false;
    }

    const bool first_key_removed = index == 0;
    leaf.keys.erase(leaf.keys.begin() + static_cast<std::ptrdiff_t>(index));
    leaf.values.erase(leaf.values.begin() + static_cast<std::ptrdiff_t>(index));
    page_manager_.decrement_key_count();

    if (leaf.parent == kInvalidPageId || leaf.keys.size() >= kMinLeafRecords) {
        write_node(leaf);
        if (first_key_removed && !leaf.keys.empty()) {
            update_first_key_in_parent(leaf.page_id, leaf.keys.front());
        }
        return true;
    }

    handle_leaf_underflow(leaf);
    return true;
}

std::vector<std::pair<std::string, std::string>> BPlusTree::scan(
    const std::optional<std::string>& start_key,
    const std::optional<std::string>& end_key,
    std::size_t limit) {
    ensure_root();
    std::vector<std::pair<std::string, std::string>> result;
    if (limit == 0) {
        return result;
    }

    PageId page_id = start_key ? find_leaf_page(*start_key) : leftmost_leaf_page();
    while (page_id != kInvalidPageId && result.size() < limit) {
        Node leaf = read_node(page_id);
        for (std::size_t index = 0; index < leaf.keys.size() && result.size() < limit; ++index) {
            const std::string& key = leaf.keys[index];
            if (start_key && key < *start_key) {
                continue;
            }
            if (end_key && key > *end_key) {
                return result;
            }
            result.emplace_back(key, read_value(leaf.values[index]));
        }
        page_id = leaf.next_leaf;
    }
    return result;
}

void BPlusTree::ensure_root() {
    if (page_manager_.metadata().root_page_id != kInvalidPageId) {
        return;
    }
    Node root = create_node(true);
    write_node(root);
    page_manager_.set_root_page(root.page_id);
}

BPlusTree::Node BPlusTree::read_node(PageId page_id) {
    auto handle = buffer_pool_.fetch_page(page_id);
    const PageData& page = handle.data();
    auto type = static_cast<PageType>(page[0]);
    if (type != PageType::Leaf && type != PageType::Internal) {
        throw CorruptionError("expected B+ tree node page");
    }

    codec::Reader reader(page.data() + 1, page.size() - 1);
    std::uint16_t count = reader.u16();
    Node node;
    node.leaf = type == PageType::Leaf;
    node.page_id = page_id;
    node.parent = reader.u64();
    node.next_leaf = reader.u64();
    node.prev_leaf = reader.u64();

    if (node.leaf) {
        node.keys.reserve(count);
        node.values.reserve(count);
        for (std::uint16_t i = 0; i < count; ++i) {
            Record record = deserialize_record(reader);
            node.keys.push_back(std::move(record.key));
            node.values.push_back(std::move(record.value));
        }
    } else {
        node.next_leaf = kInvalidPageId;
        node.prev_leaf = kInvalidPageId;
        if (count == 0) {
            throw CorruptionError("internal node cannot have zero keys");
        }
        node.children.reserve(static_cast<std::size_t>(count) + 1);
        node.keys.reserve(count);
        node.children.push_back(reader.u64());
        for (std::uint16_t i = 0; i < count; ++i) {
            std::uint16_t key_size = reader.u16();
            node.keys.push_back(reader.bytes(key_size));
            node.children.push_back(reader.u64());
        }
    }
    return node;
}

void BPlusTree::write_node(const Node& node) {
    if (!node_fits(node)) {
        throw DbException("B+ tree node does not fit in one page");
    }
    if (node.keys.size() > std::numeric_limits<std::uint16_t>::max()) {
        throw DbException("B+ tree node has too many keys");
    }

    std::vector<std::uint8_t> encoded;
    encoded.reserve(node_size(node));
    if (node.leaf) {
        append_node_header(encoded, PageType::Leaf, static_cast<std::uint16_t>(node.keys.size()),
                           node.parent, node.next_leaf, node.prev_leaf);
        for (std::size_t index = 0; index < node.keys.size(); ++index) {
            serialize_record(encoded, Record{node.keys[index], node.values[index]});
        }
    } else {
        if (node.children.size() != node.keys.size() + 1) {
            throw DbException("internal node children/key count mismatch");
        }
        append_node_header(encoded, PageType::Internal, static_cast<std::uint16_t>(node.keys.size()),
                           node.parent, kInvalidPageId, kInvalidPageId);
        codec::append_u64(encoded, node.children.front());
        for (std::size_t index = 0; index < node.keys.size(); ++index) {
            if (node.keys[index].size() > std::numeric_limits<std::uint16_t>::max()) {
                throw DbException("internal separator key is too large");
            }
            codec::append_u16(encoded, static_cast<std::uint16_t>(node.keys[index].size()));
            codec::append_bytes(encoded, node.keys[index]);
            codec::append_u64(encoded, node.children[index + 1]);
        }
    }

    auto handle = buffer_pool_.fetch_page(node.page_id);
    PageData& page = handle.data();
    page.fill(0);
    std::copy(encoded.begin(), encoded.end(), page.begin());
    handle.mark_dirty();
}

BPlusTree::Node BPlusTree::create_node(bool leaf) {
    auto handle = buffer_pool_.new_page(leaf ? PageType::Leaf : PageType::Internal);
    Node node;
    node.leaf = leaf;
    node.page_id = handle.page_id();
    return node;
}

PageId BPlusTree::find_leaf_page(const std::string& key) {
    PageId page_id = page_manager_.metadata().root_page_id;
    while (true) {
        Node node = read_node(page_id);
        if (node.leaf) {
            return node.page_id;
        }
        std::size_t child_index = upper_bound_index(node.keys, key);
        if (child_index >= node.children.size()) {
            throw CorruptionError("internal node child index is invalid");
        }
        page_id = node.children[child_index];
    }
}

BPlusTree::Node BPlusTree::find_leaf(const std::string& key) {
    return read_node(find_leaf_page(key));
}

PageId BPlusTree::leftmost_leaf_page() {
    PageId page_id = page_manager_.metadata().root_page_id;
    while (true) {
        Node node = read_node(page_id);
        if (node.leaf) {
            return node.page_id;
        }
        if (node.children.empty()) {
            throw CorruptionError("internal node has no children");
        }
        page_id = node.children.front();
    }
}

ValueRef BPlusTree::make_value_ref(std::string value) {
    return overflow_manager_.store(std::move(value));
}

std::string BPlusTree::read_value(const ValueRef& value_ref) {
    return overflow_manager_.read(value_ref);
}

void BPlusTree::split_leaf(Node& leaf) {
    if (leaf.keys.size() < 2) {
        throw DbException("cannot split a leaf with fewer than two keys");
    }

    Node right = create_node(true);
    right.parent = leaf.parent;

    std::size_t split_index = leaf.keys.size() / 2;
    right.keys.assign(leaf.keys.begin() + static_cast<std::ptrdiff_t>(split_index), leaf.keys.end());
    right.values.assign(leaf.values.begin() + static_cast<std::ptrdiff_t>(split_index), leaf.values.end());
    leaf.keys.erase(leaf.keys.begin() + static_cast<std::ptrdiff_t>(split_index), leaf.keys.end());
    leaf.values.erase(leaf.values.begin() + static_cast<std::ptrdiff_t>(split_index), leaf.values.end());

    right.next_leaf = leaf.next_leaf;
    right.prev_leaf = leaf.page_id;
    leaf.next_leaf = right.page_id;

    if (right.next_leaf != kInvalidPageId) {
        Node old_next = read_node(right.next_leaf);
        old_next.prev_leaf = right.page_id;
        write_node(old_next);
    }

    if (!node_fits(leaf) || !node_fits(right)) {
        throw DbException("split failed because a record is too large for a page");
    }

    write_node(leaf);
    write_node(right);
    insert_into_parent(leaf, right.keys.front(), right);
}

void BPlusTree::split_internal(Node& node) {
    if (node.leaf || node.keys.size() < 2) {
        throw DbException("cannot split this internal node");
    }

    std::size_t mid = node.keys.size() / 2;
    std::string separator = node.keys[mid];

    Node right = create_node(false);
    right.parent = node.parent;
    right.keys.assign(node.keys.begin() + static_cast<std::ptrdiff_t>(mid + 1), node.keys.end());
    right.children.assign(node.children.begin() + static_cast<std::ptrdiff_t>(mid + 1), node.children.end());

    node.keys.erase(node.keys.begin() + static_cast<std::ptrdiff_t>(mid), node.keys.end());
    node.children.erase(node.children.begin() + static_cast<std::ptrdiff_t>(mid + 1), node.children.end());

    for (PageId child : right.children) {
        set_parent(child, right.page_id);
    }

    if (!node_fits(node) || !node_fits(right)) {
        throw DbException("internal split failed to produce page-sized nodes");
    }

    write_node(node);
    write_node(right);
    insert_into_parent(node, separator, right);
}

void BPlusTree::insert_into_parent(Node& left, const std::string& separator, Node& right) {
    if (left.parent == kInvalidPageId) {
        Node root = create_node(false);
        root.keys.push_back(separator);
        root.children.push_back(left.page_id);
        root.children.push_back(right.page_id);
        left.parent = root.page_id;
        right.parent = root.page_id;
        write_node(left);
        write_node(right);
        write_node(root);
        page_manager_.set_root_page(root.page_id);
        return;
    }

    Node parent = read_node(left.parent);
    std::size_t child_index = find_child_index(parent, left.page_id);
    parent.keys.insert(parent.keys.begin() + static_cast<std::ptrdiff_t>(child_index), separator);
    parent.children.insert(parent.children.begin() + static_cast<std::ptrdiff_t>(child_index + 1), right.page_id);
    right.parent = parent.page_id;

    if (node_fits(parent)) {
        write_node(right);
        write_node(parent);
    } else {
        write_node(right);
        split_internal(parent);
    }
}

void BPlusTree::set_parent(PageId child_page, PageId parent_page) {
    Node child = read_node(child_page);
    child.parent = parent_page;
    write_node(child);
}

void BPlusTree::update_first_key_in_parent(PageId child_page, const std::string& new_first_key) {
    Node child = read_node(child_page);
    if (child.parent == kInvalidPageId) {
        return;
    }

    Node parent = read_node(child.parent);
    std::size_t child_index = find_child_index(parent, child_page);
    if (child_index > 0) {
        parent.keys[child_index - 1] = new_first_key;
        write_node(parent);
        return;
    }

    if (parent.parent != kInvalidPageId) {
        update_first_key_in_parent(parent.page_id, new_first_key);
    }
}

void BPlusTree::handle_leaf_underflow(Node& leaf) {
    if (leaf.parent == kInvalidPageId) {
        write_node(leaf);
        return;
    }

    Node parent = read_node(leaf.parent);
    std::size_t index = find_child_index(parent, leaf.page_id);

    if (index > 0) {
        Node left = read_node(parent.children[index - 1]);
        if (left.keys.size() > kMinLeafRecords) {
            leaf.keys.insert(leaf.keys.begin(), left.keys.back());
            leaf.values.insert(leaf.values.begin(), left.values.back());
            left.keys.pop_back();
            left.values.pop_back();
            parent.keys[index - 1] = leaf.keys.front();
            write_node(left);
            write_node(leaf);
            write_node(parent);
            return;
        }
    }

    if (index + 1 < parent.children.size()) {
        Node right = read_node(parent.children[index + 1]);
        if (right.keys.size() > kMinLeafRecords) {
            leaf.keys.push_back(right.keys.front());
            leaf.values.push_back(right.values.front());
            right.keys.erase(right.keys.begin());
            right.values.erase(right.values.begin());
            parent.keys[index] = right.keys.front();
            write_node(leaf);
            write_node(right);
            write_node(parent);
            return;
        }
    }

    if (index > 0) {
        Node left = read_node(parent.children[index - 1]);
        merge_leaf_into_left(left, leaf, parent, index - 1);
    } else if (index + 1 < parent.children.size()) {
        Node right = read_node(parent.children[index + 1]);
        merge_leaf_into_left(leaf, right, parent, index);
    } else {
        write_node(leaf);
    }
}

void BPlusTree::handle_internal_underflow(Node& node) {
    if (node.parent == kInvalidPageId) {
        if (!node.leaf && node.keys.empty() && node.children.size() == 1) {
            PageId child = node.children.front();
            set_parent(child, kInvalidPageId);
            page_manager_.set_root_page(child);
        } else {
            write_node(node);
        }
        return;
    }

    if (!node.keys.empty()) {
        write_node(node);
        return;
    }

    Node parent = read_node(node.parent);
    std::size_t index = find_child_index(parent, node.page_id);
    if (index > 0) {
        Node left = read_node(parent.children[index - 1]);
        left.keys.push_back(parent.keys[index - 1]);
        left.keys.insert(left.keys.end(), node.keys.begin(), node.keys.end());
        left.children.insert(left.children.end(), node.children.begin(), node.children.end());
        for (PageId child : node.children) {
            set_parent(child, left.page_id);
        }
        parent.keys.erase(parent.keys.begin() + static_cast<std::ptrdiff_t>(index - 1));
        parent.children.erase(parent.children.begin() + static_cast<std::ptrdiff_t>(index));
        write_node(left);
        if (parent.parent == kInvalidPageId && parent.keys.empty()) {
            handle_internal_underflow(parent);
        } else {
            write_node(parent);
            handle_internal_underflow(parent);
        }
    } else if (index + 1 < parent.children.size()) {
        Node right = read_node(parent.children[index + 1]);
        node.keys.push_back(parent.keys[index]);
        node.keys.insert(node.keys.end(), right.keys.begin(), right.keys.end());
        node.children.insert(node.children.end(), right.children.begin(), right.children.end());
        for (PageId child : right.children) {
            set_parent(child, node.page_id);
        }
        parent.keys.erase(parent.keys.begin() + static_cast<std::ptrdiff_t>(index));
        parent.children.erase(parent.children.begin() + static_cast<std::ptrdiff_t>(index + 1));
        write_node(node);
        if (parent.parent == kInvalidPageId && parent.keys.empty()) {
            handle_internal_underflow(parent);
        } else {
            write_node(parent);
            handle_internal_underflow(parent);
        }
    } else {
        write_node(node);
    }
}

void BPlusTree::merge_leaf_into_left(Node& left, Node& right, Node& parent, std::size_t separator_index) {
    left.keys.insert(left.keys.end(), right.keys.begin(), right.keys.end());
    left.values.insert(left.values.end(), right.values.begin(), right.values.end());
    left.next_leaf = right.next_leaf;
    if (right.next_leaf != kInvalidPageId) {
        Node next = read_node(right.next_leaf);
        next.prev_leaf = left.page_id;
        write_node(next);
    }

    parent.keys.erase(parent.keys.begin() + static_cast<std::ptrdiff_t>(separator_index));
    parent.children.erase(parent.children.begin() + static_cast<std::ptrdiff_t>(separator_index + 1));

    write_node(left);
    if (parent.parent == kInvalidPageId && parent.keys.empty()) {
        page_manager_.set_root_page(left.page_id);
        left.parent = kInvalidPageId;
        write_node(left);
        return;
    }

    write_node(parent);
    handle_internal_underflow(parent);
}

void BPlusTree::remove_child_from_parent(Node& parent, std::size_t child_index) {
    if (child_index >= parent.children.size()) {
        throw DbException("child index out of range");
    }
    if (parent.keys.empty()) {
        parent.children.erase(parent.children.begin() + static_cast<std::ptrdiff_t>(child_index));
        return;
    }
    std::size_t key_index = child_index == 0 ? 0 : child_index - 1;
    parent.keys.erase(parent.keys.begin() + static_cast<std::ptrdiff_t>(key_index));
    parent.children.erase(parent.children.begin() + static_cast<std::ptrdiff_t>(child_index));
}

bool BPlusTree::node_fits(const Node& node) const {
    return node_size(node) <= kPageSize;
}

std::size_t BPlusTree::node_size(const Node& node) const {
    std::size_t size = kNodeHeaderSize;
    if (node.leaf) {
        for (std::size_t index = 0; index < node.keys.size(); ++index) {
            size += serialized_record_size(Record{node.keys[index], node.values[index]});
        }
    } else {
        if (!node.children.empty()) {
            size += sizeof(std::uint64_t);
        }
        for (const auto& key : node.keys) {
            size += sizeof(std::uint16_t) + key.size() + sizeof(std::uint64_t);
        }
    }
    return size;
}

std::size_t BPlusTree::find_child_index(const Node& parent, PageId child) const {
    auto it = std::find(parent.children.begin(), parent.children.end(), child);
    if (it == parent.children.end()) {
        std::ostringstream message;
        message << "child page " << child << " is not present in parent page " << parent.page_id;
        throw CorruptionError(message.str());
    }
    return static_cast<std::size_t>(it - parent.children.begin());
}

} // namespace minidb
