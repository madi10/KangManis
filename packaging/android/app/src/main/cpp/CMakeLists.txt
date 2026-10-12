cmake_minimum_required(VERSION 3.22.1)
project(kangmanis CXX)

add_library(native-lib SHARED native-lib.cpp)

# libnode.so dari nodejs-mobile, ditempatkan oleh CI di jniLibs/<abi>/
add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
    IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so")

# header node (nodejs-mobile) ditempatkan oleh CI di cpp/libnode/
target_include_directories(native-lib PRIVATE
    "${CMAKE_SOURCE_DIR}/libnode/include"
    "${CMAKE_SOURCE_DIR}/libnode/include/node")

find_library(log-lib log)
target_link_libraries(native-lib libnode ${log-lib})
