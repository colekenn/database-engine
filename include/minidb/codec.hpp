#pragma once

#include "minidb/common.hpp"

#include <span>
#include <string>
#include <string_view>
#include <type_traits>
#include <vector>

namespace minidb::codec {

template <typename UInt>
inline void append_unsigned_le(std::vector<std::uint8_t>& out, UInt value) {
    static_assert(std::is_unsigned_v<UInt>);
    for (std::size_t byte = 0; byte < sizeof(UInt); ++byte) {
        out.push_back(static_cast<std::uint8_t>((value >> (byte * 8U)) & static_cast<UInt>(0xffU)));
    }
}

inline void append_u8(std::vector<std::uint8_t>& out, std::uint8_t value) {
    out.push_back(value);
}

inline void append_u16(std::vector<std::uint8_t>& out, std::uint16_t value) {
    append_unsigned_le(out, value);
}

inline void append_u32(std::vector<std::uint8_t>& out, std::uint32_t value) {
    append_unsigned_le(out, value);
}

inline void append_u64(std::vector<std::uint8_t>& out, std::uint64_t value) {
    append_unsigned_le(out, value);
}

inline void append_bytes(std::vector<std::uint8_t>& out, std::string_view bytes) {
    out.insert(out.end(), bytes.begin(), bytes.end());
}

class Reader {
public:
    Reader(const std::uint8_t* data, std::size_t size) : data_(data), size_(size) {}
    explicit Reader(std::span<const std::uint8_t> bytes) : Reader(bytes.data(), bytes.size()) {}

    [[nodiscard]] std::size_t offset() const { return offset_; }
    [[nodiscard]] std::size_t remaining() const {
        return offset_ <= size_ ? size_ - offset_ : 0;
    }

    std::uint8_t u8() {
        require(1);
        return data_[offset_++];
    }

    std::uint16_t u16() {
        require(2);
        return read_unsigned_le<std::uint16_t>();
    }

    std::uint32_t u32() {
        require(4);
        return read_unsigned_le<std::uint32_t>();
    }

    std::uint64_t u64() {
        require(8);
        return read_unsigned_le<std::uint64_t>();
    }

    std::string bytes(std::size_t count) {
        require(count);
        std::string value(reinterpret_cast<const char*>(data_ + offset_), count);
        offset_ += count;
        return value;
    }

private:
    void require(std::size_t count) const {
        if (count > remaining()) {
            throw CorruptionError("serialized data ended unexpectedly");
        }
    }

    template <typename UInt>
    UInt read_unsigned_le() {
        static_assert(std::is_unsigned_v<UInt>);
        UInt value = 0;
        for (std::size_t byte = 0; byte < sizeof(UInt); ++byte) {
            value |= static_cast<UInt>(data_[offset_++]) << (byte * 8U);
        }
        return value;
    }

    const std::uint8_t* data_;
    std::size_t size_;
    std::size_t offset_{0};
};

} // namespace minidb::codec
