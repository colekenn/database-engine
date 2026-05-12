#pragma once

#include "minidb/bplus_tree.hpp"
#include "minidb/buffer_pool.hpp"
#include "minidb/overflow_manager.hpp"
#include "minidb/page_manager.hpp"

#include <filesystem>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace minidb {

class KVDatabase {
public:
    static KVDatabase create(const std::filesystem::path& path, std::size_t buffer_pages = 64);
    static KVDatabase open(const std::filesystem::path& path, std::size_t buffer_pages = 64);

    KVDatabase(const KVDatabase&) = delete;
    KVDatabase& operator=(const KVDatabase&) = delete;
    KVDatabase(KVDatabase&&) noexcept = default;
    KVDatabase& operator=(KVDatabase&&) noexcept = default;
    ~KVDatabase();

    bool put(const std::string& key, std::string value);
    [[nodiscard]] std::optional<std::string> get(const std::string& key);
    bool remove(const std::string& key);
    [[nodiscard]] std::vector<std::pair<std::string, std::string>> scan(
        const std::optional<std::string>& start_key = std::nullopt,
        const std::optional<std::string>& end_key = std::nullopt,
        std::size_t limit = static_cast<std::size_t>(-1));

    [[nodiscard]] std::uint64_t size() const;
    void flush();

private:
    KVDatabase(const std::filesystem::path& path, bool create, std::size_t buffer_pages);

    PageManager page_manager_;
    BufferPool buffer_pool_;
    OverflowManager overflow_manager_;
    BPlusTree tree_;
};

} // namespace minidb
