cmake_minimum_required(VERSION 3.10)
project(kangmanis_launcher CXX)

add_executable(launcher main.cpp)
set(CMAKE_CXX_STANDARD 17)

if(NOT NODE_INCLUDE)
    message(FATAL_ERROR "NODE_INCLUDE wajib diisi")
endif()
if(NOT NODE_LIB)
    message(FATAL_ERROR "NODE_LIB wajib diisi")
endif()

target_include_directories(launcher PRIVATE ${NODE_INCLUDE})
target_link_libraries(launcher ${NODE_LIB})

# cari libnode.so & libc++_shared.so di folder yang sama
set_target_properties(launcher PROPERTIES
    BUILD_RPATH "$ORIGIN"
    INSTALL_RPATH "$ORIGIN")
