#include "minidb/database.hpp"

#include <filesystem>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>

namespace {

std::string rest_of_line(std::istringstream& input) {
    std::string value;
    std::getline(input, value);
    if (!value.empty() && value.front() == ' ') {
        value.erase(value.begin());
    }
    return value;
}

void print_help() {
    std::cout
        << "Commands:\n"
        << "  put <key> <value>\n"
        << "  get <key>\n"
        << "  del <key>\n"
        << "  scan [start] [end] [limit]\n"
        << "  size\n"
        << "  help\n"
        << "  quit\n";
}

} // namespace

int main(int argc, char** argv) {
    if (argc < 2) {
        std::cerr << "usage: minidb_cli <database-file>\n";
        return 1;
    }

    try {
        const std::filesystem::path path = argv[1];
        auto db = std::filesystem::exists(path)
            ? minidb::KVDatabase::open(path)
            : minidb::KVDatabase::create(path);

        std::cout << "MiniDB ready at " << path.string() << '\n';
        print_help();

        std::string line;
        while (std::cout << "minidb> " && std::getline(std::cin, line)) {
            std::istringstream input(line);
            std::string command;
            input >> command;
            if (command.empty()) {
                continue;
            }
            if (command == "quit" || command == "exit") {
                break;
            }
            if (command == "help") {
                print_help();
                continue;
            }
            if (command == "put") {
                std::string key;
                input >> key;
                std::string value = rest_of_line(input);
                if (key.empty()) {
                    std::cout << "missing key\n";
                    continue;
                }
                bool inserted = db.put(key, value);
                db.flush();
                std::cout << (inserted ? "inserted" : "updated") << '\n';
                continue;
            }
            if (command == "get") {
                std::string key;
                input >> key;
                auto value = db.get(key);
                if (value) {
                    std::cout << *value << '\n';
                } else {
                    std::cout << "(not found)\n";
                }
                continue;
            }
            if (command == "del" || command == "delete") {
                std::string key;
                input >> key;
                bool removed = db.remove(key);
                db.flush();
                std::cout << (removed ? "deleted" : "not found") << '\n';
                continue;
            }
            if (command == "scan") {
                std::string start;
                std::string end;
                std::size_t limit = static_cast<std::size_t>(-1);
                input >> start >> end;
                if (!(input >> limit)) {
                    limit = static_cast<std::size_t>(-1);
                }
                std::optional<std::string> start_key = start.empty() ? std::nullopt : std::make_optional(start);
                std::optional<std::string> end_key = end.empty() ? std::nullopt : std::make_optional(end);
                for (const auto& [key, value] : db.scan(start_key, end_key, limit)) {
                    std::cout << key << " = " << value << '\n';
                }
                continue;
            }
            if (command == "size") {
                std::cout << db.size() << '\n';
                continue;
            }
            std::cout << "unknown command\n";
        }
        db.flush();
    } catch (const std::exception& ex) {
        std::cerr << "error: " << ex.what() << '\n';
        return 1;
    }
    return 0;
}
