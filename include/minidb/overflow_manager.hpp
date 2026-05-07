#pragma once

#include "minidb/buffer_pool.hpp"
#include "minidb/record.hpp"

#include <string>

namespace minidb {

class OverflowManager {
public:
    explicit OverflowManager(BufferPool& buffer_pool) : buffer_pool_(buffer_pool) {}

    [[nodiscard]] ValueRef store(std::string value);
    [[nodiscard]] std::string read(const ValueRef& value_ref);

private:
    BufferPool& buffer_pool_;
};

} // namespace minidb
