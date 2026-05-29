cmake_minimum_required(VERSION 3.16)

project(minidb LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(minidb
    src/bplus_tree.cpp
    src/buffer_pool.cpp
    src/database.cpp
    src/overflow_manager.cpp
    src/page_manager.cpp
    src/record.cpp
)

target_include_directories(minidb PUBLIC include)

if(MSVC)
    target_compile_options(minidb PRIVATE /W4 /permissive-)
else()
    target_compile_options(minidb PRIVATE -Wall -Wextra -Wpedantic)
endif()

add_executable(minidb_tests tests/test_main.cpp)
target_link_libraries(minidb_tests PRIVATE minidb)

add_executable(minidb_cli examples/minidb_cli.cpp)
target_link_libraries(minidb_cli PRIVATE minidb)

add_executable(minidb_bench bench/bench.cpp)
target_link_libraries(minidb_bench PRIVATE minidb)

add_executable(minidb_server src/api_server.cpp)
target_link_libraries(minidb_server PRIVATE minidb)
if(WIN32)
    target_link_libraries(minidb_server PRIVATE ws2_32)
endif()

enable_testing()
add_test(NAME minidb_tests COMMAND minidb_tests)
