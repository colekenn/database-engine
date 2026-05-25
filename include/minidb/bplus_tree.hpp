#pragma once

#include "minidb/buffer_pool.hpp"
#include "minidb/overflow_manager.hpp"
#include "minidb/page_manager.hpp"
#include "minidb/record.hpp"

#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace minidb {

class BPlusTree {
public:
    struct TreeNodeSnapshot {
        bool leaf{true};
        PageId page_id{kInvalidPageId};
        PageId parent{kInvalidPageId};
        PageId next_leaf{kInvalidPageId};
        PageId prev_leaf{kInvalidPageId};
        std::vector<std::string> keys;
        std::vector<PageId> children;
        std::size_t used_bytes{0};
    };

    struct TreeSnapshot {
        PageId root_page_id{kInvalidPageId};
        std::size_t height{0};
        std::vector<TreeNodeSnapshot> nodes;
        std::vector<PageId> search_path;
    };

    BPlusTree(PageManager& page_manager, BufferPool& buffer_pool, OverflowManager& overflow_manager);

    bool put(const std::string& key, std::string value);
    [[nodiscard]] std::optional<std::string> get(const std::string& key);
    bool remove(const std::string& key);

    [[nodiscard]] std::vector<std::pair<std::string, std::string>> scan(
        const std::optional<std::string>& start_key = std::nullopt,
        const std::optional<std::string>& end_key = std::nullopt,
        std::size_t limit = static_cast<std::size_t>(-1));
    [[nodiscard]] TreeSnapshot snapshot(const std::optional<std::string>& search_key = std::nullopt);

private:
    struct Node {
        bool leaf{true};
        PageId page_id{kInvalidPageId};
        PageId parent{kInvalidPageId};
        PageId next_leaf{kInvalidPageId};
        PageId prev_leaf{kInvalidPageId};
        std::vector<std::string> keys;
        std::vector<ValueRef> values;
        std::vector<PageId> children;
    };

    void ensure_root();
    [[nodiscard]] Node read_node(PageId page_id);
    void write_node(const Node& node);
    [[nodiscard]] Node create_node(bool leaf);

    [[nodiscard]] PageId find_leaf_page(const std::string& key);
    [[nodiscard]] Node find_leaf(const std::string& key);
    [[nodiscard]] PageId leftmost_leaf_page();

    [[nodiscard]] ValueRef make_value_ref(std::string value);
    [[nodiscard]] std::string read_value(const ValueRef& value_ref);

    void split_leaf(Node& leaf);
    void split_internal(Node& node);
    void insert_into_parent(Node& left, const std::string& separator, Node& right);

    void set_parent(PageId child_page, PageId parent_page);
    void update_first_key_in_parent(PageId child_page, const std::string& new_first_key);
    void handle_leaf_underflow(Node& leaf);
    void handle_internal_underflow(Node& node);
    void merge_leaf_into_left(Node& left, Node& right, Node& parent, std::size_t separator_index);
    void remove_child_from_parent(Node& parent, std::size_t child_index);

    [[nodiscard]] bool node_fits(const Node& node) const;
    [[nodiscard]] std::size_t node_size(const Node& node) const;
    [[nodiscard]] std::size_t find_child_index(const Node& parent, PageId child) const;

    PageManager& page_manager_;
    BufferPool& buffer_pool_;
    OverflowManager& overflow_manager_;
};

} // namespace minidb
