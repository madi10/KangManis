#include <android/log.h>

#include "node.h"

#define LOG_TAG "KangManisNode"

int main(int argc, char** argv) {
    if (argc < 2) {
        __android_log_write(ANDROID_LOG_ERROR, LOG_TAG, "Usage: launcher <script.js> [args]");
        return 1;
    }

    // argv dari OS sudah berurutan di memori, yang dibutuhkan libuv. Teruskan apa adanya.
    return node::Start(argc, argv);
}
