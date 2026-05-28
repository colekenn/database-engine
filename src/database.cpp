#include "minidb/database.hpp"

namespace minidb {
namespace {

double fraction(std::uint64_t part, std::uint64_t total) {
    if (total == 0) {
        return 0.0;
    }
    return static_cast<double>(part) / static_cast<double>(total);
}

} // namespace

KVDatabase KVDatabase::create(const std::filesystem::path& path, std::size_t buffer_pages) {
    return KVDatabase(path, true, buffer_pages);
}

KVDatabase KVDatabase::open(const std::filesystem::path& path, std::size_t buffer_pages) {
    return KVDatabase(path, false, buffer_pages);
}

KVDatabase::KVDatabase(const std::filesystem::path& path, bool create, std::size_t buffer_pages)
    : page_manager_(path, create),
      buffer_pool_(page_manager_, buffer_pages),
      overflow_manager_(buffer_pool_),
      tree_(page_manager_, buffer_pool_, overflow_manager_) {}

KVDatabase::~KVDatabase() {
    try {
        flush();
    } catch (...) {
    }
}

bool KVDatabase::put(const std::string& key, std::string value) {
    return tree_.put(key, std::move(value));
}

std::optional<std::string> KVDatabase::get(const std::string& key) {
    return tree_.get(key);
}

bool KVDatabase::remove(const std::string& key) {
    return tree_.remove(key);
}

std::vector<std::pair<std::string, std::string>> KVDatabase::scan(
    const std::optional<std::string>& start_key,
    const std::optional<std::string>& end_key,
    std::size_t limit) {
    return tree_.scan(start_key, end_key, limit);
}

std::uint64_t KVDatabase::size() const {
    return page_manager_.metadata().key_count;
}

BPlusTree::TreeSnapshot KVDatabase::tree_snapshot(const std::optional<std::string>& search_key) {
    return tree_.snapshot(search_key);
}

DatabaseStats KVDatabase::stats() {
    DatabaseStats result;
    result.total_records = size();
    result.page_size_bytes = kPageSize;
    result.page_count = page_manager_.page_count();
    result.metadata_pages = result.page_count > 0 ? 1 : 0;

    try {
        result.database_size_bytes = std::filesystem::file_size(page_manager_.path());
    } catch (...) {
        result.database_size_bytes = result.page_count * kPageSize;
    }

    auto tree = tree_.snapshot();
    result.tree_height = tree.height;
    for (const auto& node : tree.nodes) {
        result.tree_used_bytes += node.used_bytes;
        if (node.leaf) {
            ++result.leaf_pages;
        } else {
            ++result.internal_pages;
        }
    }

    const std::uint64_t known_pages = result.metadata_pages + result.internal_pages + result.leaf_pages;
    if (result.page_count > known_pages) {
        result.overflow_pages = result.page_count - known_pages;
    }

    result.tree_allocated_bytes = (result.internal_pages + result.leaf_pages) * kPageSize;
    result.page_utilization = fraction(result.tree_used_bytes, result.tree_allocated_bytes);

    auto buffer_stats = buffer_pool_.stats();
    result.buffer_capacity = buffer_stats.capacity;
    result.buffer_resident_pages = buffer_stats.resident_pages;
    result.cache_hits = buffer_stats.cache_hits;
    result.cache_misses = buffer_stats.cache_misses;
    const std::uint64_t cache_total = result.cache_hits + result.cache_misses;
    result.cache_hit_rate = fraction(result.cache_hits, cache_total);
    result.cache_miss_rate = fraction(result.cache_misses, cache_total);

    auto io_stats = page_manager_.io_stats();
    result.read_operations = io_stats.read_operations;
    result.write_operations = io_stats.write_operations;
    return result;
}

void KVDatabase::flush() {
    buffer_pool_.flush_all();
    page_manager_.flush();
}

} // namespace minidb
