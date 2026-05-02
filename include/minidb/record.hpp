#pragma once

#include "minidb/codec.hpp"
#include "minidb/common.hpp"

#include <optional>
#include <string>
#include <vector>

namespace minidb {

inline constexpr std::size_t kInlineValueLimit = 512;

struct ValueRef {
    enum class Kind : std::uint8_t {
        Inline = 0,
        Overflow = 1,
    };

    Kind kind{Kind::Inline};
    std::string inline_value;
    PageId overflow_page_id{kInvalidPageId};
    std::uint32_t value_size{0};

    [[nodiscard]] static ValueRef inline_value_ref(std::string value);
    [[nodiscard]] static ValueRef overflow_value_ref(PageId first_page, std::uint32_t size);
    [[nodiscard]] bool is_inline() const { return kind == Kind::Inline; }
};

struct Record {
    std::string key;
    ValueRef value;
};

[[nodiscard]] std::size_t serialized_record_size(const Record& record);
void serialize_record(std::vector<std::uint8_t>& out, const Record& record);
[[nodiscard]] Record deserialize_record(codec::Reader& reader);

} // namespace minidb
