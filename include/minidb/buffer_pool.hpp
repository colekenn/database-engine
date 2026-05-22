#pragma once

#include "minidb/common.hpp"
#include "minidb/page_manager.hpp"

#include <cstddef>
#include <unordered_map>
#include <vector>

namespace minidb {

struct BufferPoolStats {
    std::size_t capacity{0};
    std::size_t resident_pages{0};
    std::uint64_t cache_hits{0};
    std::uint64_t cache_misses{0};
};

class BufferPool;

class PageHandle {
public:
    PageHandle() = default;
    PageHandle(BufferPool* pool, std::size_t frame_index, PageId page_id);
    ~PageHandle();

    PageHandle(const PageHandle&) = delete;
    PageHandle& operator=(const PageHandle&) = delete;
    PageHandle(PageHandle&& other) noexcept;
    PageHandle& operator=(PageHandle&& other) noexcept;

    [[nodiscard]] bool valid() const { return pool_ != nullptr; }
    [[nodiscard]] PageId page_id() const { return page_id_; }

    PageData& data();
    const PageData& data() const;
    void mark_dirty();

private:
    void release();

    BufferPool* pool_{nullptr};
    std::size_t frame_index_{0};
    PageId page_id_{kInvalidPageId};
};

class BufferPool {
public:
    explicit BufferPool(PageManager& page_manager, std::size_t capacity = 64);
    ~BufferPool();

    BufferPool(const BufferPool&) = delete;
    BufferPool& operator=(const BufferPool&) = delete;

    PageHandle fetch_page(PageId page_id);
    PageHandle new_page(PageType type);

    void flush_page(PageId page_id);
    void flush_all();

    [[nodiscard]] std::size_t capacity() const { return frames_.size(); }
    [[nodiscard]] std::size_t resident_pages() const { return page_table_.size(); }
    [[nodiscard]] bool contains(PageId page_id) const { return page_table_.contains(page_id); }
    [[nodiscard]] BufferPoolStats stats() const;

private:
    friend class PageHandle;

    struct Frame {
        PageId page_id{kInvalidPageId};
        PageData data{};
        std::size_t pin_count{0};
        bool dirty{false};
        std::uint64_t last_used{0};
        bool occupied{false};
    };

    PageData& frame_data(std::size_t frame_index);
    const PageData& frame_data(std::size_t frame_index) const;
    void mark_dirty(std::size_t frame_index);
    void unpin(std::size_t frame_index);

    std::size_t acquire_frame();
    void write_back(std::size_t frame_index);

    PageManager& page_manager_;
    std::vector<Frame> frames_;
    std::unordered_map<PageId, std::size_t> page_table_;
    std::uint64_t clock_{0};
    std::uint64_t cache_hits_{0};
    std::uint64_t cache_misses_{0};
};

} // namespace minidb
