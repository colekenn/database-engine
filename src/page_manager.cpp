#include "minidb/page_manager.hpp"

#include "minidb/codec.hpp"

#include <algorithm>
#include <cstring>
#include <vector>

namespace minidb {
namespace {

constexpr std::array<std::uint8_t, 8> kMagic{'M', 'I', 'N', 'I', 'D', 'B', '2', '\0'};
constexpr std::size_t kMetadataPageId = 0;

void put_bytes(PageData& page, std::size_t offset, const std::vector<std::uint8_t>& bytes) {
    if (offset + bytes.size() > page.size()) {
        throw DbException("metadata page overflow");
    }
    std::copy(bytes.begin(), bytes.end(), page.begin() + static_cast<std::ptrdiff_t>(offset));
}

} // namespace

PageManager::PageManager(const std::filesystem::path& path, bool create) : path_(path), create_(create) {
    if (create_) {
        create_new_file();
    } else {
        open_existing_file();
    }
}

PageManager::~PageManager() {
    try {
        flush();
    } catch (...) {
    }
}

PageId PageManager::allocate_page(PageType type) {
    PageId page_id = metadata_.next_page_id++;
    PageData page{};
    page[0] = static_cast<std::uint8_t>(type);
    write_page(page_id, page);
    write_header();
    return page_id;
}

PageData PageManager::read_page(PageId page_id) {
    validate_page_id(page_id);
    PageData page{};
    file_.seekg(static_cast<std::streamoff>(page_id * kPageSize), std::ios::beg);
    if (!file_) {
        throw IOError("failed to seek while reading page " + std::to_string(page_id));
    }
    file_.read(reinterpret_cast<char*>(page.data()), static_cast<std::streamsize>(page.size()));
    if (file_.gcount() != static_cast<std::streamsize>(page.size())) {
        throw CorruptionError("database file ended in the middle of page " + std::to_string(page_id));
    }
    return page;
}

void PageManager::write_page(PageId page_id, const PageData& data) {
    if (page_id >= metadata_.next_page_id && page_id != kMetadataPageId) {
        throw DbException("cannot write unallocated page " + std::to_string(page_id));
    }
    file_.seekp(static_cast<std::streamoff>(page_id * kPageSize), std::ios::beg);
    if (!file_) {
        throw IOError("failed to seek while writing page " + std::to_string(page_id));
    }
    file_.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
    if (!file_) {
        throw IOError("failed to write page " + std::to_string(page_id));
    }
}

void PageManager::set_root_page(PageId page_id) {
    if (page_id != kInvalidPageId) {
        validate_page_id(page_id);
    }
    metadata_.root_page_id = page_id;
    write_header();
}

void PageManager::set_key_count(std::uint64_t key_count) {
    metadata_.key_count = key_count;
    write_header();
}

void PageManager::increment_key_count() {
    ++metadata_.key_count;
    write_header();
}

void PageManager::decrement_key_count() {
    if (metadata_.key_count == 0) {
        throw DbException("key count underflow");
    }
    --metadata_.key_count;
    write_header();
}

void PageManager::flush() {
    if (file_.is_open()) {
        file_.flush();
    }
}

void PageManager::create_new_file() {
    const auto parent = path_.parent_path();
    if (!parent.empty()) {
        std::filesystem::create_directories(parent);
    }
    file_.open(path_, std::ios::binary | std::ios::in | std::ios::out | std::ios::trunc);
    if (!file_) {
        throw IOError("failed to create database file: " + path_.string());
    }
    metadata_ = DbMetadata{};
    write_header();
    flush();
}

void PageManager::open_existing_file() {
    if (!std::filesystem::exists(path_)) {
        throw IOError("database file does not exist: " + path_.string());
    }
    file_.open(path_, std::ios::binary | std::ios::in | std::ios::out);
    if (!file_) {
        throw IOError("failed to open database file: " + path_.string());
    }

    PageData page{};
    file_.seekg(0, std::ios::beg);
    file_.read(reinterpret_cast<char*>(page.data()), static_cast<std::streamsize>(page.size()));
    if (file_.gcount() != static_cast<std::streamsize>(page.size())) {
        throw CorruptionError("database header is incomplete");
    }

    if (!std::equal(kMagic.begin(), kMagic.end(), page.begin())) {
        throw CorruptionError("database file has invalid magic header");
    }

    codec::Reader reader(page.data() + kMagic.size(), page.size() - kMagic.size());
    std::uint32_t version = reader.u32();
    std::uint32_t page_size = reader.u32();
    if (version != kFormatVersion) {
        throw CorruptionError("unsupported database format version");
    }
    if (page_size != kPageSize) {
        throw CorruptionError("database page size does not match this build");
    }

    metadata_.root_page_id = reader.u64();
    metadata_.next_page_id = reader.u64();
    metadata_.key_count = reader.u64();
    if (metadata_.next_page_id == 0) {
        throw CorruptionError("database next page id is invalid");
    }
    if (metadata_.root_page_id != kInvalidPageId && metadata_.root_page_id >= metadata_.next_page_id) {
        throw CorruptionError("database root page id is outside the file");
    }

    const auto file_size = std::filesystem::file_size(path_);
    const auto expected_min_size = metadata_.next_page_id * static_cast<std::uint64_t>(kPageSize);
    if (file_size < expected_min_size) {
        throw CorruptionError("database file is smaller than its metadata claims");
    }
}

void PageManager::write_header() {
    PageData page{};
    std::copy(kMagic.begin(), kMagic.end(), page.begin());

    std::vector<std::uint8_t> encoded;
    codec::append_u32(encoded, kFormatVersion);
    codec::append_u32(encoded, kPageSize);
    codec::append_u64(encoded, metadata_.root_page_id);
    codec::append_u64(encoded, metadata_.next_page_id);
    codec::append_u64(encoded, metadata_.key_count);
    put_bytes(page, kMagic.size(), encoded);

    file_.seekp(0, std::ios::beg);
    file_.write(reinterpret_cast<const char*>(page.data()), static_cast<std::streamsize>(page.size()));
    if (!file_) {
        throw IOError("failed to write database header");
    }
}

void PageManager::validate_page_id(PageId page_id) const {
    if (page_id == kInvalidPageId || page_id >= metadata_.next_page_id) {
        throw DbException("page id is outside the database file: " + std::to_string(page_id));
    }
}

} // namespace minidb
