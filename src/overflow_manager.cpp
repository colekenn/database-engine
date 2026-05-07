#include "minidb/overflow_manager.hpp"

#include "minidb/codec.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <unordered_set>
#include <vector>

namespace minidb {
namespace {

constexpr std::size_t kOverflowHeaderSize = 1 + sizeof(std::uint64_t) + sizeof(std::uint32_t);
constexpr std::size_t kOverflowPayloadSize = kPageSize - kOverflowHeaderSize;

} // namespace

ValueRef OverflowManager::store(std::string value) {
    if (value.size() > std::numeric_limits<std::uint32_t>::max()) {
        throw DbException("value is too large to store");
    }
    if (value.size() <= kInlineValueLimit) {
        return ValueRef::inline_value_ref(std::move(value));
    }

    PageId first_page = kInvalidPageId;
    PageId previous_page = kInvalidPageId;
    std::size_t offset = 0;
    while (offset < value.size()) {
        PageId page_id = kInvalidPageId;
        std::size_t chunk_size = 0;
        {
            auto handle = buffer_pool_.new_page(PageType::Overflow);
            page_id = handle.page_id();
            chunk_size = std::min(kOverflowPayloadSize, value.size() - offset);

            PageData& page = handle.data();
            page.fill(0);
            page[0] = static_cast<std::uint8_t>(PageType::Overflow);
            std::vector<std::uint8_t> header;
            codec::append_u64(header, kInvalidPageId);
            codec::append_u32(header, static_cast<std::uint32_t>(chunk_size));
            std::copy(header.begin(), header.end(), page.begin() + 1);
            std::memcpy(page.data() + kOverflowHeaderSize, value.data() + offset, chunk_size);
            handle.mark_dirty();
        }

        if (first_page == kInvalidPageId) {
            first_page = page_id;
        }

        if (previous_page != kInvalidPageId) {
            auto previous = buffer_pool_.fetch_page(previous_page);
            std::vector<std::uint8_t> next_encoded;
            codec::append_u64(next_encoded, page_id);
            std::copy(next_encoded.begin(), next_encoded.end(), previous.data().begin() + 1);
            previous.mark_dirty();
        }

        previous_page = page_id;
        offset += chunk_size;
    }

    return ValueRef::overflow_value_ref(first_page, static_cast<std::uint32_t>(value.size()));
}

std::string OverflowManager::read(const ValueRef& value_ref) {
    if (value_ref.kind == ValueRef::Kind::Inline) {
        return value_ref.inline_value;
    }
    if (value_ref.kind != ValueRef::Kind::Overflow) {
        throw CorruptionError("value reference has an unknown storage kind");
    }
    if (value_ref.value_size == 0) {
        if (value_ref.overflow_page_id != kInvalidPageId) {
            throw CorruptionError("zero-length overflow value references a page");
        }
        return {};
    }
    if (value_ref.overflow_page_id == kInvalidPageId) {
        throw CorruptionError("non-empty overflow value is missing its first page");
    }

    std::string value;
    value.reserve(value_ref.value_size);
    PageId page_id = value_ref.overflow_page_id;
    std::unordered_set<PageId> seen_pages;
    while (page_id != kInvalidPageId && value.size() < value_ref.value_size) {
        if (!seen_pages.insert(page_id).second) {
            throw CorruptionError("overflow chain contains a cycle");
        }

        auto handle = buffer_pool_.fetch_page(page_id);
        const PageData& page = handle.data();
        if (page[0] != static_cast<std::uint8_t>(PageType::Overflow)) {
            throw CorruptionError("expected overflow page while reading value");
        }
        codec::Reader reader(page.data() + 1, page.size() - 1);
        PageId next_page = reader.u64();
        std::uint32_t payload_size = reader.u32();
        if (payload_size > kOverflowPayloadSize) {
            throw CorruptionError("overflow page payload length is invalid");
        }
        const std::size_t remaining = value_ref.value_size - value.size();
        if (payload_size == 0 || payload_size > remaining) {
            throw CorruptionError("overflow page payload length does not match the value reference");
        }
        value.append(reinterpret_cast<const char*>(page.data() + kOverflowHeaderSize), payload_size);
        if (value.size() == value_ref.value_size && next_page != kInvalidPageId) {
            throw CorruptionError("overflow chain contains trailing pages");
        }
        page_id = next_page;
    }
    if (value.size() != value_ref.value_size) {
        throw CorruptionError("overflow chain ended before value was complete");
    }
    return value;
}

} // namespace minidb
