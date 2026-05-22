#include "minidb/buffer_pool.hpp"

#include <algorithm>
#include <limits>

namespace minidb {

PageHandle::PageHandle(BufferPool* pool, std::size_t frame_index, PageId page_id)
    : pool_(pool), frame_index_(frame_index), page_id_(page_id) {}

PageHandle::~PageHandle() {
    release();
}

PageHandle::PageHandle(PageHandle&& other) noexcept
    : pool_(other.pool_), frame_index_(other.frame_index_), page_id_(other.page_id_) {
    other.pool_ = nullptr;
    other.page_id_ = kInvalidPageId;
}

PageHandle& PageHandle::operator=(PageHandle&& other) noexcept {
    if (this != &other) {
        release();
        pool_ = other.pool_;
        frame_index_ = other.frame_index_;
        page_id_ = other.page_id_;
        other.pool_ = nullptr;
        other.page_id_ = kInvalidPageId;
    }
    return *this;
}

PageData& PageHandle::data() {
    if (!pool_) {
        throw DbException("attempted to access an invalid page handle");
    }
    return pool_->frame_data(frame_index_);
}

const PageData& PageHandle::data() const {
    if (!pool_) {
        throw DbException("attempted to access an invalid page handle");
    }
    return pool_->frame_data(frame_index_);
}

void PageHandle::mark_dirty() {
    if (!pool_) {
        throw DbException("attempted to dirty an invalid page handle");
    }
    pool_->mark_dirty(frame_index_);
}

void PageHandle::release() {
    if (pool_) {
        pool_->unpin(frame_index_);
        pool_ = nullptr;
        page_id_ = kInvalidPageId;
    }
}

BufferPool::BufferPool(PageManager& page_manager, std::size_t capacity) : page_manager_(page_manager) {
    if (capacity == 0) {
        throw DbException("buffer pool capacity must be greater than zero");
    }
    frames_.resize(capacity);
}

BufferPool::~BufferPool() {
    try {
        flush_all();
    } catch (...) {
    }
}

PageHandle BufferPool::fetch_page(PageId page_id) {
    if (auto it = page_table_.find(page_id); it != page_table_.end()) {
        ++cache_hits_;
        Frame& frame = frames_[it->second];
        ++frame.pin_count;
        frame.last_used = ++clock_;
        return PageHandle(this, it->second, page_id);
    }

    ++cache_misses_;
    std::size_t frame_index = acquire_frame();
    Frame& frame = frames_[frame_index];
    frame.page_id = page_id;
    frame.data = page_manager_.read_page(page_id);
    frame.pin_count = 1;
    frame.dirty = false;
    frame.last_used = ++clock_;
    frame.occupied = true;
    page_table_[page_id] = frame_index;
    return PageHandle(this, frame_index, page_id);
}

PageHandle BufferPool::new_page(PageType type) {
    PageId page_id = page_manager_.allocate_page(type);
    std::size_t frame_index = acquire_frame();
    Frame& frame = frames_[frame_index];
    frame.page_id = page_id;
    frame.data = PageData{};
    frame.data[0] = static_cast<std::uint8_t>(type);
    frame.pin_count = 1;
    frame.dirty = true;
    frame.last_used = ++clock_;
    frame.occupied = true;
    page_table_[page_id] = frame_index;
    return PageHandle(this, frame_index, page_id);
}

void BufferPool::flush_page(PageId page_id) {
    auto it = page_table_.find(page_id);
    if (it == page_table_.end()) {
        return;
    }
    write_back(it->second);
}

void BufferPool::flush_all() {
    for (std::size_t index = 0; index < frames_.size(); ++index) {
        write_back(index);
    }
    page_manager_.flush();
}

BufferPoolStats BufferPool::stats() const {
    BufferPoolStats result;
    result.capacity = frames_.size();
    result.resident_pages = page_table_.size();
    result.cache_hits = cache_hits_;
    result.cache_misses = cache_misses_;
    return result;
}

PageData& BufferPool::frame_data(std::size_t frame_index) {
    return frames_.at(frame_index).data;
}

const PageData& BufferPool::frame_data(std::size_t frame_index) const {
    return frames_.at(frame_index).data;
}

void BufferPool::mark_dirty(std::size_t frame_index) {
    Frame& frame = frames_.at(frame_index);
    frame.dirty = true;
    frame.last_used = ++clock_;
}

void BufferPool::unpin(std::size_t frame_index) {
    Frame& frame = frames_.at(frame_index);
    if (frame.pin_count == 0) {
        throw DbException("buffer frame pin count underflow");
    }
    --frame.pin_count;
    frame.last_used = ++clock_;
}

std::size_t BufferPool::acquire_frame() {
    for (std::size_t index = 0; index < frames_.size(); ++index) {
        if (!frames_[index].occupied) {
            return index;
        }
    }

    std::size_t victim = frames_.size();
    std::uint64_t oldest = std::numeric_limits<std::uint64_t>::max();
    for (std::size_t index = 0; index < frames_.size(); ++index) {
        const Frame& frame = frames_[index];
        if (frame.pin_count == 0 && frame.last_used < oldest) {
            oldest = frame.last_used;
            victim = index;
        }
    }
    if (victim == frames_.size()) {
        throw DbException("all buffer frames are pinned");
    }

    write_back(victim);
    page_table_.erase(frames_[victim].page_id);
    frames_[victim] = Frame{};
    return victim;
}

void BufferPool::write_back(std::size_t frame_index) {
    Frame& frame = frames_[frame_index];
    if (!frame.occupied || !frame.dirty) {
        return;
    }
    page_manager_.write_page(frame.page_id, frame.data);
    frame.dirty = false;
}

} // namespace minidb
