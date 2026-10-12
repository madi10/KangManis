#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <pthread.h>
#include <android/log.h>

#include "node.h"

#define LOG_TAG "KangManisNode"

static int sPipe[2];

static void* logThread(void*) {
    ssize_t r;
    char buffer[2048];
    while ((r = read(sPipe[0], buffer, sizeof(buffer) - 1)) > 0) {
        if (buffer[r - 1] == '\n') {
            --r;
        }
        buffer[r] = '\0';
        __android_log_write(ANDROID_LOG_INFO, LOG_TAG, buffer);
    }
    return nullptr;
}

static void redirectStdio() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(sPipe) == 0) {
        dup2(sPipe[1], STDOUT_FILENO);
        dup2(sPipe[1], STDERR_FILENO);
        pthread_t thread;
        if (pthread_create(&thread, nullptr, logThread, nullptr) == 0) {
            pthread_detach(thread);
        }
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_kangmanis_app_NodeNative_startNode(JNIEnv* env, jclass clazz, jobjectArray args, jstring nodePath) {
    redirectStdio();

    const char* path = env->GetStringUTFChars(nodePath, nullptr);
    if (path != nullptr) {
        setenv("NODE_PATH", path, 1);
        env->ReleaseStringUTFChars(nodePath, path);
    }

    // node/libuv memerlukan seluruh argumen berada pada blok memori yang berurutan.
    jsize argumentCount = env->GetArrayLength(args);
    const char* first = "node";

    int totalSize = (int) strlen(first) + 1;
    for (jsize i = 0; i < argumentCount; i++) {
        jstring js = (jstring) env->GetObjectArrayElement(args, i);
        const char* cs = env->GetStringUTFChars(js, nullptr);
        totalSize += (int) strlen(cs) + 1;
        env->ReleaseStringUTFChars(js, cs);
        env->DeleteLocalRef(js);
    }

    char* buffer = (char*) calloc(totalSize, sizeof(char));
    char** argv = new char*[argumentCount + 2];
    char* cursor = buffer;

    strcpy(cursor, first);
    argv[0] = cursor;
    cursor += strlen(first) + 1;

    for (jsize i = 0; i < argumentCount; i++) {
        jstring js = (jstring) env->GetObjectArrayElement(args, i);
        const char* cs = env->GetStringUTFChars(js, nullptr);
        strcpy(cursor, cs);
        argv[i + 1] = cursor;
        cursor += strlen(cs) + 1;
        env->ReleaseStringUTFChars(js, cs);
        env->DeleteLocalRef(js);
    }
    argv[argumentCount + 1] = nullptr;

    node::Start(argumentCount + 1, argv);

    free(buffer);
    delete[] argv;
}
