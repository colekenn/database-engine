#include "minidb/database.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <random>
#include <sstream>
#include <string>
#include <vector>

namespace {

std::string key_for(int value) {
    std::ostringstream out;
    out << "bench-" << std::setw(6) << std::setfill('0') << value;
    return out.str();
}

template <typename Fn>
double time_ms(Fn&& fn) {
    auto start = std::chrono::steady_clock::now();
    fn();
    auto end = std::chrono::steady_clock::now();
    return std::chrono::duration<double, std::milli>(end - start).count();
}

} // namespace

int main(int argc, char** argv) {
    const int count = argc > 1 ? std::stoi(argv[1]) : 10000;
    const auto path = std::filesystem::temp_directory_path() / "minidb_bench.db";
    std::error_code ec;
    std::filesystem::remove(path, ec);

    try {
        auto db = minidb::KVDatabase::create(path, 128);
        double insert_ms = time_ms([&] {
            for (int i = 0; i < count; ++i) {
                db.put(key_for(i), "payload-" + std::to_string(i));
            }
            db.flush();
        });

        std::vector<int> lookups;
        lookups.reserve(static_cast<std::size_t>(count));
        for (int i = 0; i < count; ++i) {
            lookups.push_back(i);
        }
        std::mt19937 rng(42);
        std::shuffle(lookups.begin(), lookups.end(), rng);

        double lookup_ms = time_ms([&] {
            for (int value : lookups) {
                auto found = db.get(key_for(value));
                if (!found) {
                    throw std::runtime_error("missing key during benchmark");
                }
            }
        });

        double scan_ms = time_ms([&] {
            for (int i = 0; i < 100; ++i) {
                int start = (i * count) / 100;
                auto rows = db.scan(key_for(start), key_for(std::min(count - 1, start + 99)));
                if (rows.empty()) {
                    throw std::runtime_error("empty scan during benchmark");
                }
            }
        });

        std::cout << "records: " << count << '\n';
        std::cout << "insert:  " << insert_ms << " ms (" << (count / (insert_ms / 1000.0)) << " ops/s)\n";
        std::cout << "lookup:  " << lookup_ms << " ms (" << (count / (lookup_ms / 1000.0)) << " ops/s)\n";
        std::cout << "scan:    " << scan_ms << " ms (100 bounded range scans)\n";
        std::cout << "file:    " << path.string() << '\n';
    } catch (const std::exception& ex) {
        std::cerr << "benchmark failed: " << ex.what() << '\n';
        return 1;
    }
    return 0;
}
