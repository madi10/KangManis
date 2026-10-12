package com.kangmanis.app;

public final class NodeNative {
    static {
        System.loadLibrary("native-lib");
    }

    private NodeNative() {}

    public static native void startNode(String[] args, String nodePath);
}
