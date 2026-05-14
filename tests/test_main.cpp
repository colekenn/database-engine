#include "minidb/buffer_pool.hpp"
#include "minidb/codec.hpp"
#include "minidb/database.hpp"
#include "minidb/overflow_manager.hpp"
#include "minidb/page_manager.hpp"
#include "minidb/record.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <limits>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::filesystem::path test_path(const std::string& name) {
    auto now = std::chrono::steady_clock::now().time_since_epoch().count();
    return std::filesystem::temp_directory_path()
        / ("minidb_" + name + "_" + std::to_string(now) + ".db");
}

std::string key_for(int value) {
    std::ostringstream out;
    out << "key-" << std::setw(4) << std::setfill('0') << value;
    return out.str();
}

void require(bool condition, const char* expression, const char* file, int line) {
    if (!condition) {
        std::ostringstream message;
        message << file << ":" << line << " check failed: " << expression;
        throw std::runtime_error(message.str());
    }
}

#define CHECK(expr) require(static_cast<bool>(expr), #expr, __FILE__, __LINE__)

class TempFile {
public:
    explicit TempFile(std::string name) : path_(test_path(name)) {}
    ~TempFile() {
        std::error_code ec;
        std::filesystem::remove(path_, ec);
    }
    [[nodiscard]] const std::filesystem::path& path() const { return path_; }

private:
    std::filesystem::path path_;
};

void test_codec_fixed_width_integers() {
    std::vector<std::uint8_t> encoded;
    minidb::codec::append_u32(encoded, 0x89abcdefU);
    minidb::codec::append_u64(encoded, std::uint64_t{0x0123456789abcdefULL});
    minidb::codec::append_u32(encoded, std::numeric_limits<std::uint32_t>::max());
    minidb::codec::append_u64(encoded, std::numeric_limits<std::uint64_t>::max());

    const std::vector<std::uint8_t> expected_prefix{
        0xef, 0xcd, 0xab, 0x89,
        0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01,
    };
    CHECK(std::equal(expected_prefix.begin(), expected_prefix.end(), encoded.begin()));

    minidb::codec::Reader reader(encoded.data(), encoded.size());
    CHECK(reader.u32() == 0x89abcdefU);
    CHECK(reader.u64() == std::uint64_t{0x0123456789abcdefULL});
    CHECK(reader.u32() == std::numeric_limits<std::uint32_t>::max());
    CHECK(reader.u64() == std::numeric_limits<std::uint64_t>::max());
    CHECK(reader.remaining() == 0);

    std::vector<std::uint8_t> truncated{1, 2, 3};
    minidb::codec::Reader short_reader(truncated.data(), truncated.size());
    bool threw = false;
    try {
        (void)short_reader.u32();
    } catch (const minidb::CorruptionError&) {
        threw = true;
    }
    CHECK(threw);
}

void test_record_serialization() {
    minidb::Record original{
        "alpha",
        minidb::ValueRef::inline_value_ref("bravo"),
    };
    std::vector<std::uint8_t> encoded;
    minidb::serialize_record(encoded, original);
    minidb::codec::Reader reader(encoded.data(), encoded.size());
    auto decoded = minidb::deserialize_record(reader);
    CHECK(decoded.key == "alpha");
    CHECK(decoded.value.is_inline());
    CHECK(decoded.value.inline_value == "bravo");

    minidb::Record overflow{
        "large",
        minidb::ValueRef::overflow_value_ref(42, 9000),
    };
    encoded.clear();
    minidb::serialize_record(encoded, overflow);
    minidb::codec::Reader overflow_reader(encoded.data(), encoded.size());
    auto decoded_overflow = minidb::deserialize_record(overflow_reader);
    CHECK(decoded_overflow.key == "large");
    CHECK(!decoded_overflow.value.is_inline());
    CHECK(decoded_overflow.value.overflow_page_id == 42);
    CHECK(decoded_overflow.value.value_size == 9000);
}

void test_page_manager() {
    TempFile file("page_manager");
    {
        minidb::PageManager manager(file.path(), true);
        auto page_id = manager.allocate_page(minidb::PageType::Leaf);
        minidb::PageData page{};
        page[0] = static_cast<std::uint8_t>(minidb::PageType::Leaf);
        page[100] = 77;
        manager.write_page(page_id, page);
        manager.set_root_page(page_id);
        manager.set_key_count(3);
        manager.flush();
    }
    {
        minidb::PageManager manager(file.path(), false);
        CHECK(manager.metadata().root_page_id == 1);
        CHECK(manager.metadata().key_count == 3);
        auto page = manager.read_page(1);
        CHECK(page[0] == static_cast<std::uint8_t>(minidb::PageType::Leaf));
        CHECK(page[100] == 77);
    }
}

void test_buffer_pool_eviction() {
    TempFile file("buffer_pool");
    {
        minidb::PageManager manager(file.path(), true);
        minidb::BufferPool pool(manager, 2);
        minidb::PageId first = 0;
        minidb::PageId second = 0;
        {
            auto page = pool.new_page(minidb::PageType::Leaf);
            first = page.page_id();
            page.data()[64] = 10;
            page.mark_dirty();
        }
        {
            auto page = pool.new_page(minidb::PageType::Leaf);
            second = page.page_id();
            page.data()[64] = 20;
            page.mark_dirty();
        }
        CHECK(pool.resident_pages() == 2);
        {
            auto page = pool.new_page(minidb::PageType::Leaf);
            page.data()[64] = 30;
            page.mark_dirty();
        }
        CHECK(pool.resident_pages() == 2);
        pool.flush_all();
        CHECK(manager.read_page(first)[64] == 10);
        CHECK(manager.read_page(second)[64] == 20);
    }
}

void test_overflow_manager_edge_cases() {
    {
        TempFile file("overflow_single_frame");
        minidb::PageManager manager(file.path(), true);
        minidb::BufferPool pool(manager, 1);
        minidb::OverflowManager overflow(pool);

        const std::string large_value(9000, 'q');
        auto ref = overflow.store(large_value);
        CHECK(!ref.is_inline());
        pool.flush_all();
        CHECK(overflow.read(ref) == large_value);
    }

    {
        TempFile file("overflow_cycle");
        minidb::PageManager manager(file.path(), true);
        minidb::BufferPool pool(manager, 2);
        minidb::OverflowManager overflow(pool);
        minidb::PageId page_id = minidb::kInvalidPageId;

        {
            auto page = pool.new_page(minidb::PageType::Overflow);
            page_id = page.page_id();
            page.data().fill(0);
            page.data()[0] = static_cast<std::uint8_t>(minidb::PageType::Overflow);
            std::vector<std::uint8_t> header;
            minidb::codec::append_u64(header, page_id);
            minidb::codec::append_u32(header, 10);
            std::copy(header.begin(), header.end(), page.data().begin() + 1);
            std::fill(page.data().begin() + 13, page.data().begin() + 23, static_cast<std::uint8_t>('x'));
            page.mark_dirty();
        }

        bool threw = false;
        try {
            (void)overflow.read(minidb::ValueRef::overflow_value_ref(page_id, 20));
        } catch (const minidb::CorruptionError&) {
            threw = true;
        }
        CHECK(threw);
    }
}

void test_bplus_tree_operations() {
    TempFile file("tree_ops");
    minidb::KVDatabase db = minidb::KVDatabase::create(file.path(), 8);

    for (int i = 0; i < 240; ++i) {
        CHECK(db.put(key_for(i), "value-" + std::to_string(i)));
    }
    CHECK(db.size() == 240);
    for (int i = 0; i < 240; ++i) {
        auto value = db.get(key_for(i));
        CHECK(value.has_value());
        CHECK(*value == "value-" + std::to_string(i));
    }

    CHECK(!db.put(key_for(25), "updated"));
    CHECK(db.size() == 240);
    CHECK(db.get(key_for(25)).value() == "updated");

    auto range = db.scan(key_for(10), key_for(19));
    CHECK(range.size() == 10);
    CHECK(range.front().first == key_for(10));
    CHECK(range.back().first == key_for(19));

    for (int i = 0; i < 180; ++i) {
        CHECK(db.remove(key_for(i)));
    }
    CHECK(db.size() == 60);
    for (int i = 0; i < 180; ++i) {
        CHECK(!db.get(key_for(i)).has_value());
    }
    for (int i = 180; i < 240; ++i) {
        CHECK(db.get(key_for(i)).has_value());
    }
    auto tail = db.scan(std::nullopt, std::nullopt);
    CHECK(tail.size() == 60);
    CHECK(tail.front().first == key_for(180));
    CHECK(tail.back().first == key_for(239));
}

void test_persistence_and_large_values() {
    TempFile file("persistence");
    const std::string large_value(12000, 'x');
    {
        auto db = minidb::KVDatabase::create(file.path(), 5);
        CHECK(db.put("empty", ""));
        CHECK(db.put("large", large_value));
        CHECK(db.put("normal", "hello"));
        CHECK(!db.put("normal", "world"));
        CHECK(db.remove("empty"));
        db.flush();
    }
    {
        auto db = minidb::KVDatabase::open(file.path(), 5);
        CHECK(db.size() == 2);
        CHECK(!db.get("empty").has_value());
        CHECK(db.get("normal").value() == "world");
        CHECK(db.get("large").value() == large_value);
        auto range = db.scan(std::nullopt, std::nullopt);
        CHECK(range.size() == 2);
        CHECK(range[0].first == "large");
        CHECK(range[1].first == "normal");
    }
}

void test_integration_lifecycle() {
    TempFile file("lifecycle");
    {
        auto db = minidb::KVDatabase::create(file.path(), 16);
        CHECK(db.put("a", "1"));
        CHECK(db.put("b", "2"));
        CHECK(db.put("c", "3"));
        CHECK(db.remove("b"));
        CHECK(db.put("d", "4"));
        auto values = db.scan("a", "z");
        CHECK(values.size() == 3);
        CHECK(values[0].first == "a");
        CHECK(values[1].first == "c");
        CHECK(values[2].first == "d");
    }
    {
        auto db = minidb::KVDatabase::open(file.path(), 16);
        CHECK(db.size() == 3);
        CHECK(db.get("a").value() == "1");
        CHECK(!db.get("b").has_value());
        CHECK(db.get("c").value() == "3");
        CHECK(db.get("d").value() == "4");
    }
}

using TestFn = void (*)();

void run_test(const std::string& name, TestFn test) {
    test();
    std::cout << "[pass] " << name << '\n';
}

} // namespace

int main() {
    try {
        run_test("fixed-width integer codec", test_codec_fixed_width_integers);
        run_test("record serialization", test_record_serialization);
        run_test("page manager", test_page_manager);
        run_test("buffer pool eviction", test_buffer_pool_eviction);
        run_test("overflow manager edge cases", test_overflow_manager_edge_cases);
        run_test("b+ tree operations", test_bplus_tree_operations);
        run_test("persistence and large values", test_persistence_and_large_values);
        run_test("integration lifecycle", test_integration_lifecycle);
    } catch (const std::exception& ex) {
        std::cerr << "[fail] " << ex.what() << '\n';
        return 1;
    }
    return 0;
}
