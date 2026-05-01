#pragma once

#include <array>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>

namespace minidb {

using PageId = std::uint64_t;

inline constexpr std::uint32_t kPageSize = 4096;
inline constexpr PageId kInvalidPageId = std::numeric_limits<PageId>::max();
inline constexpr std::uint32_t kFormatVersion = 1;

using PageData = std::array<std::uint8_t, kPageSize>;

enum class PageType : std::uint8_t {
    Metadata = 1,
    Leaf = 2,
    Internal = 3,
    Overflow = 4,
};

class DbException : public std::runtime_error {
public:
    explicit DbException(const std::string& message) : std::runtime_error(message) {}
};

class CorruptionError : public DbException {
public:
    explicit CorruptionError(const std::string& message) : DbException(message) {}
};

class IOError : public DbException {
public:
    explicit IOError(const std::string& message) : DbException(message) {}
};

} // namespace minidb
