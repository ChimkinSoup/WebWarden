cmake_minimum_required(VERSION 3.16)
project(WebWardenCompanion VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(
  json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(json)

FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG v1.14.0
)
FetchContent_MakeAvailable(googletest)

enable_testing()

add_executable(WebWardenCompanion
  src/main.cpp
  src/uptime.cpp
  src/message_handler.cpp
  src/storage/json_store.cpp
)

target_include_directories(WebWardenCompanion PRIVATE include)

target_link_libraries(WebWardenCompanion PRIVATE nlohmann_json::nlohmann_json)

if(WIN32)
  target_link_libraries(WebWardenCompanion PRIVATE kernel32 ole32 shell32)
endif()

add_executable(companion_tests
  ../tests/companion/json_store_test.cpp
  src/uptime.cpp
  src/storage/json_store.cpp
)

target_include_directories(companion_tests PRIVATE include)
target_link_libraries(companion_tests PRIVATE nlohmann_json::nlohmann_json GTest::gtest_main)

if(WIN32)
  target_link_libraries(companion_tests PRIVATE kernel32 ole32 shell32)
endif()

include(GoogleTest)
gtest_discover_tests(companion_tests)
