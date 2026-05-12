#include "minidb/database.hpp"

namespace minidb {

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

void KVDatabase::flush() {
    buffer_pool_.flush_all();
    page_manager_.flush();
}

} // namespace minidb
