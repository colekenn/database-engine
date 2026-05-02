#include "minidb/record.hpp"

#include "minidb/codec.hpp"

#include <limits>

namespace minidb {

ValueRef ValueRef::inline_value_ref(std::string value) {
    if (value.size() > std::numeric_limits<std::uint32_t>::max()) {
        throw DbException("value is too large to serialize");
    }
    ValueRef ref;
    ref.kind = Kind::Inline;
    ref.value_size = static_cast<std::uint32_t>(value.size());
    ref.inline_value = std::move(value);
    return ref;
}

ValueRef ValueRef::overflow_value_ref(PageId first_page, std::uint32_t size) {
    ValueRef ref;
    ref.kind = Kind::Overflow;
    ref.overflow_page_id = first_page;
    ref.value_size = size;
    return ref;
}

std::size_t serialized_record_size(const Record& record) {
    std::size_t size = sizeof(std::uint16_t) + record.key.size() + sizeof(std::uint8_t) + sizeof(std::uint32_t);
    if (record.value.kind == ValueRef::Kind::Inline) {
        size += record.value.inline_value.size();
    } else {
        size += sizeof(std::uint64_t);
    }
    return size;
}

void serialize_record(std::vector<std::uint8_t>& out, const Record& record) {
    if (record.key.size() > std::numeric_limits<std::uint16_t>::max()) {
        throw DbException("key is too large to serialize");
    }
    codec::append_u16(out, static_cast<std::uint16_t>(record.key.size()));
    codec::append_bytes(out, record.key);
    codec::append_u8(out, static_cast<std::uint8_t>(record.value.kind));
    codec::append_u32(out, record.value.value_size);
    if (record.value.kind == ValueRef::Kind::Inline) {
        codec::append_bytes(out, record.value.inline_value);
    } else {
        codec::append_u64(out, record.value.overflow_page_id);
    }
}

Record deserialize_record(codec::Reader& reader) {
    Record record;
    auto key_size = reader.u16();
    record.key = reader.bytes(key_size);

    auto kind = static_cast<ValueRef::Kind>(reader.u8());
    auto value_size = reader.u32();
    if (kind == ValueRef::Kind::Inline) {
        record.value = ValueRef::inline_value_ref(reader.bytes(value_size));
    } else if (kind == ValueRef::Kind::Overflow) {
        record.value = ValueRef::overflow_value_ref(reader.u64(), value_size);
    } else {
        throw CorruptionError("record contains an unknown value reference kind");
    }
    return record;
}

} // namespace minidb
