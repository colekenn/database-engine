#pragma once

#include "minidb/common.hpp"

#include <filesystem>
#include <fstream>
#include <string>

namespace minidb {

struct DbMetadata {
    PageId root_page_id{kInvalidPageId};
    PageId next_page_id{1};
    std::uint64_t key_count{0};
};

struct PageManagerStats {
    std::uint64_t read_operations{0};
    std::uint64_t write_operations{0};
};

class PageManager {
public:
    PageManager(const std::filesystem::path& path, bool create);
    ~PageManager();

    PageManager(const PageManager&) = delete;
    PageManager& operator=(const PageManager&) = delete;

    [[nodiscard]] const std::filesystem::path& path() const { return path_; }
    [[nodiscard]] const DbMetadata& metadata() const { return metadata_; }
    [[nodiscard]] std::uint64_t page_count() const { return metadata_.next_page_id; }
    [[nodiscard]] PageManagerStats io_stats() const { return stats_; }

    PageId allocate_page(PageType type);
    PageData read_page(PageId page_id);
    void write_page(PageId page_id, const PageData& data);

    void set_root_page(PageId page_id);
    void set_key_count(std::uint64_t key_count);
    void increment_key_count();
    void decrement_key_count();

    void flush();

private:
    void create_new_file();
    void open_existing_file();
    void write_header();
    void validate_page_id(PageId page_id) const;

    std::filesystem::path path_;
    bool create_;
    std::fstream file_;
    DbMetadata metadata_;
    PageManagerStats stats_;
};

} // namespace minidb
