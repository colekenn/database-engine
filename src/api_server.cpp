#include "minidb/database.hpp"

#include <algorithm>
#include <charconv>
#include <cctype>
#include <csignal>
#include <cstddef>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

namespace {

volatile std::sig_atomic_t g_running = 1;

void handle_signal(int) {
    g_running = 0;
}

#ifdef _WIN32
using SocketHandle = SOCKET;
constexpr SocketHandle kInvalidSocket = INVALID_SOCKET;

void close_socket(SocketHandle socket) {
    closesocket(socket);
}

class WinsockSession {
public:
    WinsockSession() {
        WSADATA data{};
        if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
            throw std::runtime_error("WSAStartup failed");
        }
    }

    ~WinsockSession() {
        WSACleanup();
    }
};
#else
using SocketHandle = int;
constexpr SocketHandle kInvalidSocket = -1;

void close_socket(SocketHandle socket) {
    close(socket);
}

class WinsockSession {
public:
    WinsockSession() = default;
};
#endif

struct Request {
    std::string method;
    std::string target;
    std::string path;
    std::map<std::string, std::string> query;
    std::map<std::string, std::string> headers;
    std::string body;
};

struct Response {
    int status{200};
    std::string body;
};

std::string lowercase(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

std::string trim(std::string value) {
    while (!value.empty() && std::isspace(static_cast<unsigned char>(value.front()))) {
        value.erase(value.begin());
    }
    while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back()))) {
        value.pop_back();
    }
    return value;
}

int hex_value(char ch) {
    if (ch >= '0' && ch <= '9') {
        return ch - '0';
    }
    if (ch >= 'a' && ch <= 'f') {
        return ch - 'a' + 10;
    }
    if (ch >= 'A' && ch <= 'F') {
        return ch - 'A' + 10;
    }
    return -1;
}

std::string url_decode(std::string_view value) {
    std::string decoded;
    decoded.reserve(value.size());
    for (std::size_t index = 0; index < value.size(); ++index) {
        const char ch = value[index];
        if (ch == '+') {
            decoded.push_back(' ');
            continue;
        }
        if (ch == '%' && index + 2 < value.size()) {
            const int high = hex_value(value[index + 1]);
            const int low = hex_value(value[index + 2]);
            if (high >= 0 && low >= 0) {
                decoded.push_back(static_cast<char>((high << 4) | low));
                index += 2;
                continue;
            }
        }
        decoded.push_back(ch);
    }
    return decoded;
}

std::map<std::string, std::string> parse_query(std::string_view query) {
    std::map<std::string, std::string> result;
    std::size_t start = 0;
    while (start <= query.size()) {
        const std::size_t amp = query.find('&', start);
        const std::string_view part = query.substr(start, amp == std::string_view::npos ? query.size() - start : amp - start);
        if (!part.empty()) {
            const std::size_t equals = part.find('=');
            const auto key = equals == std::string_view::npos ? part : part.substr(0, equals);
            const auto value = equals == std::string_view::npos ? std::string_view{} : part.substr(equals + 1);
            result[url_decode(key)] = url_decode(value);
        }
        if (amp == std::string_view::npos) {
            break;
        }
        start = amp + 1;
    }
    return result;
}

std::string json_escape(std::string_view value) {
    std::ostringstream out;
    for (unsigned char ch : value) {
        switch (ch) {
        case '"':
            out << "\\\"";
            break;
        case '\\':
            out << "\\\\";
            break;
        case '\b':
            out << "\\b";
            break;
        case '\f':
            out << "\\f";
            break;
        case '\n':
            out << "\\n";
            break;
        case '\r':
            out << "\\r";
            break;
        case '\t':
            out << "\\t";
            break;
        default:
            if (ch < 0x20) {
                out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(ch)
                    << std::dec << std::setfill(' ');
            } else {
                out << static_cast<char>(ch);
            }
        }
    }
    return out.str();
}

std::string json_string(std::string_view value) {
    return "\"" + json_escape(value) + "\"";
}

std::string json_page_id(minidb::PageId page_id) {
    if (page_id == minidb::kInvalidPageId) {
        return "null";
    }
    return std::to_string(page_id);
}

Response json_response(int status, std::string body) {
    return Response{status, std::move(body)};
}

Response json_error(int status, std::string_view message) {
    return json_response(status, "{\"error\":" + json_string(message) + "}");
}

bool consume_json_string(std::string_view body, std::size_t& index, std::string& out) {
    if (index >= body.size() || body[index] != '"') {
        return false;
    }
    ++index;
    while (index < body.size()) {
        const char ch = body[index++];
        if (ch == '"') {
            return true;
        }
        if (ch != '\\') {
            out.push_back(ch);
            continue;
        }
        if (index >= body.size()) {
            return false;
        }
        const char escaped = body[index++];
        switch (escaped) {
        case '"':
        case '\\':
        case '/':
            out.push_back(escaped);
            break;
        case 'b':
            out.push_back('\b');
            break;
        case 'f':
            out.push_back('\f');
            break;
        case 'n':
            out.push_back('\n');
            break;
        case 'r':
            out.push_back('\r');
            break;
        case 't':
            out.push_back('\t');
            break;
        default:
            return false;
        }
    }
    return false;
}

std::optional<std::string> json_field(std::string_view body, std::string_view field) {
    const std::string needle = "\"" + std::string(field) + "\"";
    std::size_t key = body.find(needle);
    while (key != std::string_view::npos) {
        std::size_t index = key + needle.size();
        while (index < body.size() && std::isspace(static_cast<unsigned char>(body[index]))) {
            ++index;
        }
        if (index >= body.size() || body[index] != ':') {
            key = body.find(needle, key + 1);
            continue;
        }
        ++index;
        while (index < body.size() && std::isspace(static_cast<unsigned char>(body[index]))) {
            ++index;
        }
        std::string value;
        if (consume_json_string(body, index, value)) {
            return value;
        }
        return std::nullopt;
    }
    return std::nullopt;
}

std::size_t parse_limit(const std::map<std::string, std::string>& query, std::size_t fallback) {
    auto it = query.find("limit");
    if (it == query.end() || it->second.empty()) {
        return fallback;
    }
    std::size_t value = fallback;
    const auto* first = it->second.data();
    const auto* last = it->second.data() + it->second.size();
    auto [ptr, ec] = std::from_chars(first, last, value);
    if (ec != std::errc{} || ptr != last) {
        throw std::runtime_error("limit must be a positive integer");
    }
    return std::min<std::size_t>(value, 1000);
}

std::string json_records(const std::vector<std::pair<std::string, std::string>>& records) {
    std::string body = "{\"count\":" + std::to_string(records.size()) + ",\"records\":[";
    for (std::size_t index = 0; index < records.size(); ++index) {
        if (index > 0) {
            body += ',';
        }
        body += "{\"key\":" + json_string(records[index].first) + ",\"value\":" + json_string(records[index].second) + "}";
    }
    body += "]}";
    return body;
}

std::string json_stats(const minidb::DatabaseStats& stats) {
    std::ostringstream out;
    out << "{"
        << "\"totalRecords\":" << stats.total_records << ','
        << "\"databaseSizeBytes\":" << stats.database_size_bytes << ','
        << "\"pageSizeBytes\":" << stats.page_size_bytes << ','
        << "\"pageCount\":" << stats.page_count << ','
        << "\"metadataPages\":" << stats.metadata_pages << ','
        << "\"internalPages\":" << stats.internal_pages << ','
        << "\"leafPages\":" << stats.leaf_pages << ','
        << "\"overflowPages\":" << stats.overflow_pages << ','
        << "\"treeHeight\":" << stats.tree_height << ','
        << "\"treeUsedBytes\":" << stats.tree_used_bytes << ','
        << "\"treeAllocatedBytes\":" << stats.tree_allocated_bytes << ','
        << "\"pageUtilization\":" << stats.page_utilization << ','
        << "\"bufferCapacity\":" << stats.buffer_capacity << ','
        << "\"bufferResidentPages\":" << stats.buffer_resident_pages << ','
        << "\"cacheHits\":" << stats.cache_hits << ','
        << "\"cacheMisses\":" << stats.cache_misses << ','
        << "\"cacheHitRate\":" << stats.cache_hit_rate << ','
        << "\"cacheMissRate\":" << stats.cache_miss_rate << ','
        << "\"readOperations\":" << stats.read_operations << ','
        << "\"writeOperations\":" << stats.write_operations
        << "}";
    return out.str();
}

std::string json_tree(const minidb::BPlusTree::TreeSnapshot& tree) {
    std::string body = "{\"rootPageId\":" + json_page_id(tree.root_page_id)
        + ",\"height\":" + std::to_string(tree.height) + ",\"nodes\":[";
    for (std::size_t index = 0; index < tree.nodes.size(); ++index) {
        const auto& node = tree.nodes[index];
        if (index > 0) {
            body += ',';
        }
        body += "{\"id\":" + json_string(std::to_string(node.page_id))
            + ",\"pageId\":" + json_page_id(node.page_id)
            + ",\"type\":" + json_string(node.leaf ? "leaf" : "internal")
            + ",\"parentId\":" + json_page_id(node.parent)
            + ",\"nextLeaf\":" + json_page_id(node.next_leaf)
            + ",\"prevLeaf\":" + json_page_id(node.prev_leaf)
            + ",\"usedBytes\":" + std::to_string(node.used_bytes)
            + ",\"keys\":[";
        for (std::size_t key_index = 0; key_index < node.keys.size(); ++key_index) {
            if (key_index > 0) {
                body += ',';
            }
            body += json_string(node.keys[key_index]);
        }
        body += "],\"children\":[";
        for (std::size_t child_index = 0; child_index < node.children.size(); ++child_index) {
            if (child_index > 0) {
                body += ',';
            }
            body += json_page_id(node.children[child_index]);
        }
        body += "]}";
    }
    body += "],\"searchPath\":[";
    for (std::size_t index = 0; index < tree.search_path.size(); ++index) {
        if (index > 0) {
            body += ',';
        }
        body += json_page_id(tree.search_path[index]);
    }
    body += "]}";
    return body;
}

std::string status_text(int status) {
    switch (status) {
    case 200:
        return "OK";
    case 201:
        return "Created";
    case 204:
        return "No Content";
    case 400:
        return "Bad Request";
    case 404:
        return "Not Found";
    case 405:
        return "Method Not Allowed";
    case 500:
        return "Internal Server Error";
    default:
        return "OK";
    }
}

std::size_t content_length_from_header(std::string_view header) {
    std::istringstream input{std::string(header)};
    std::string line;
    while (std::getline(input, line)) {
        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }
        const auto colon = line.find(':');
        if (colon == std::string::npos) {
            continue;
        }
        if (lowercase(line.substr(0, colon)) == "content-length") {
            return static_cast<std::size_t>(std::stoull(trim(line.substr(colon + 1))));
        }
    }
    return 0;
}

std::optional<Request> read_request(SocketHandle client) {
    std::string raw;
    std::size_t header_end = std::string::npos;
    std::size_t expected_size = 0;
    char chunk[4096];
    while (true) {
        const int received = recv(client, chunk, static_cast<int>(sizeof(chunk)), 0);
        if (received <= 0) {
            return std::nullopt;
        }
        raw.append(chunk, chunk + received);
        if (header_end == std::string::npos) {
            header_end = raw.find("\r\n\r\n");
            if (header_end != std::string::npos) {
                const std::size_t body_length = content_length_from_header(std::string_view(raw.data(), header_end));
                expected_size = header_end + 4 + body_length;
            }
        }
        if (header_end != std::string::npos && raw.size() >= expected_size) {
            break;
        }
    }

    Request request;
    std::istringstream input(raw.substr(0, header_end));
    input >> request.method >> request.target;
    std::string line;
    std::getline(input, line);
    while (std::getline(input, line)) {
        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }
        const auto colon = line.find(':');
        if (colon == std::string::npos) {
            continue;
        }
        request.headers[lowercase(line.substr(0, colon))] = trim(line.substr(colon + 1));
    }
    request.body = raw.substr(header_end + 4, expected_size - (header_end + 4));

    const std::size_t query_start = request.target.find('?');
    request.path = url_decode(query_start == std::string::npos
        ? std::string_view(request.target)
        : std::string_view(request.target.data(), query_start));
    if (query_start != std::string::npos) {
        request.query = parse_query(std::string_view(request.target).substr(query_start + 1));
    }
    return request;
}

bool send_all(SocketHandle client, std::string_view data) {
    std::size_t sent = 0;
    while (sent < data.size()) {
        const int chunk = send(client, data.data() + sent, static_cast<int>(data.size() - sent), 0);
        if (chunk <= 0) {
            return false;
        }
        sent += static_cast<std::size_t>(chunk);
    }
    return true;
}

void send_response(SocketHandle client, const Response& response) {
    std::ostringstream out;
    out << "HTTP/1.1 " << response.status << ' ' << status_text(response.status) << "\r\n"
        << "Content-Type: application/json; charset=utf-8\r\n"
        << "Access-Control-Allow-Origin: *\r\n"
        << "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n"
        << "Access-Control-Allow-Headers: Content-Type\r\n"
        << "Connection: close\r\n"
        << "Content-Length: " << response.body.size() << "\r\n\r\n"
        << response.body;
    (void)send_all(client, out.str());
}

class ApiApp {
public:
    ApiApp(std::filesystem::path path, std::size_t buffer_pages)
        : path_(std::move(path)),
          db_(std::filesystem::exists(path_) ? minidb::KVDatabase::open(path_, buffer_pages)
                                             : minidb::KVDatabase::create(path_, buffer_pages)) {}

    Response handle(const Request& request) {
        try {
            if (request.method == "OPTIONS") {
                return json_response(204, "");
            }
            if (request.method == "GET" && request.path == "/health") {
                return health();
            }
            if (request.method == "GET" && request.path == "/stats") {
                return json_response(200, json_stats(db_.stats()));
            }
            if (request.method == "GET" && request.path == "/tree") {
                std::optional<std::string> key;
                if (auto it = request.query.find("key"); it != request.query.end() && !it->second.empty()) {
                    key = it->second;
                }
                return json_response(200, json_tree(db_.tree_snapshot(key)));
            }
            if (request.method == "GET" && request.path == "/range") {
                return range(request);
            }
            if (request.method == "POST" && request.path == "/records") {
                return create_record(request);
            }
            if (request.path.rfind("/records/", 0) == 0) {
                return record_by_key(request);
            }
            return json_error(404, "endpoint not found");
        } catch (const std::exception& ex) {
            return json_error(400, ex.what());
        }
    }

private:
    Response health() {
        std::ostringstream out;
        out << "{"
            << "\"status\":\"ok\","
            << "\"engine\":\"MiniDB\","
            << "\"databasePath\":" << json_string(path_.string()) << ','
            << "\"records\":" << db_.size()
            << "}";
        return json_response(200, out.str());
    }

    Response range(const Request& request) {
        std::optional<std::string> start;
        std::optional<std::string> end;
        if (auto it = request.query.find("start"); it != request.query.end() && !it->second.empty()) {
            start = it->second;
        }
        if (auto it = request.query.find("end"); it != request.query.end() && !it->second.empty()) {
            end = it->second;
        }
        const std::size_t limit = parse_limit(request.query, 100);
        return json_response(200, json_records(db_.scan(start, end, limit)));
    }

    Response create_record(const Request& request) {
        auto key = json_field(request.body, "key");
        auto value = json_field(request.body, "value");
        if (!key || !value || key->empty()) {
            return json_error(400, "POST /records expects JSON with non-empty key and value strings");
        }
        const bool inserted = db_.put(*key, *value);
        db_.flush();
        return json_response(inserted ? 201 : 200,
            "{\"key\":" + json_string(*key) + ",\"value\":" + json_string(*value)
                + ",\"inserted\":" + std::string(inserted ? "true" : "false") + "}");
    }

    Response record_by_key(const Request& request) {
        const std::string key = request.path.substr(std::string("/records/").size());
        if (key.empty()) {
            return json_error(400, "record key is required");
        }
        if (request.method == "GET") {
            auto value = db_.get(key);
            if (!value) {
                return json_error(404, "record not found");
            }
            return json_response(200, "{\"key\":" + json_string(key) + ",\"value\":" + json_string(*value) + "}");
        }
        if (request.method == "PUT") {
            auto value = json_field(request.body, "value");
            if (!value) {
                return json_error(400, "PUT /records/:key expects JSON with a value string");
            }
            const bool inserted = db_.put(key, *value);
            db_.flush();
            return json_response(200,
                "{\"key\":" + json_string(key) + ",\"value\":" + json_string(*value)
                    + ",\"inserted\":" + std::string(inserted ? "true" : "false") + "}");
        }
        if (request.method == "DELETE") {
            const bool removed = db_.remove(key);
            db_.flush();
            if (!removed) {
                return json_error(404, "record not found");
            }
            return json_response(200, "{\"key\":" + json_string(key) + ",\"deleted\":true}");
        }
        return json_error(405, "method not allowed for /records/:key");
    }

    std::filesystem::path path_;
    minidb::KVDatabase db_;
};

SocketHandle create_server_socket(std::uint16_t port) {
    SocketHandle server = socket(AF_INET, SOCK_STREAM, 0);
    if (server == kInvalidSocket) {
        throw std::runtime_error("failed to create server socket");
    }

    int enabled = 1;
#ifdef _WIN32
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&enabled), sizeof(enabled));
#else
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &enabled, sizeof(enabled));
#endif

    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_ANY);
    address.sin_port = htons(port);

    if (bind(server, reinterpret_cast<sockaddr*>(&address), sizeof(address)) != 0) {
        close_socket(server);
        throw std::runtime_error("failed to bind API port");
    }
    if (listen(server, 16) != 0) {
        close_socket(server);
        throw std::runtime_error("failed to listen on API port");
    }
    return server;
}

void serve(ApiApp& app, std::uint16_t port) {
    WinsockSession winsock;
    SocketHandle server = create_server_socket(port);
    std::cout << "MiniDB API listening on http://localhost:" << port << '\n';
    while (g_running) {
        sockaddr_in client_address{};
#ifdef _WIN32
        int address_length = sizeof(client_address);
#else
        socklen_t address_length = sizeof(client_address);
#endif
        SocketHandle client = accept(server, reinterpret_cast<sockaddr*>(&client_address), &address_length);
        if (client == kInvalidSocket) {
            continue;
        }
        if (auto request = read_request(client)) {
            Response response = app.handle(*request);
            send_response(client, response);
        }
        close_socket(client);
    }
    close_socket(server);
}

std::uint16_t parse_port(const char* value) {
    int parsed = std::stoi(value);
    if (parsed <= 0 || parsed > 65535) {
        throw std::runtime_error("port must be between 1 and 65535");
    }
    return static_cast<std::uint16_t>(parsed);
}

} // namespace

int main(int argc, char** argv) {
    try {
        std::signal(SIGINT, handle_signal);
        std::signal(SIGTERM, handle_signal);

        const std::filesystem::path database_path = argc > 1 ? argv[1] : "demo.db";
        const std::uint16_t port = argc > 2 ? parse_port(argv[2]) : 8080;
        ApiApp app(database_path, 128);
        std::cout << "Using database file: " << database_path.string() << '\n';
        serve(app, port);
    } catch (const std::exception& ex) {
        std::cerr << "api server failed: " << ex.what() << '\n';
        return 1;
    }
    return 0;
}
