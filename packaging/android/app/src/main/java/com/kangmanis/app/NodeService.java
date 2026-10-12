package com.kangmanis.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class NodeService extends Service {

    public static final String CHANNEL_ID = "kangmanis";

    private static final String[] PAYLOAD_ITEMS = {
            "server.js", "index.html", "login.html", "package.json", "node_modules", "assets"
    };

    private Thread nodeThread;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "KangManis", NotificationManager.IMPORTANCE_LOW);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(1, buildNotification());
        if (nodeThread == null || !nodeThread.isAlive()) {
            nodeThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        File projectDir = preparePayload();
                        String script = new File(projectDir, "server.js").getAbsolutePath();
                        NodeNative.startNode(new String[]{script}, projectDir.getAbsolutePath());
                    } catch (Throwable t) {
                        t.printStackTrace();
                    }
                }
            }, "kangmanis-node");
            nodeThread.start();
        }
        return START_STICKY;
    }

    private File preparePayload() throws Exception {
        File projectDir = new File(getFilesDir(), "nodejs-project");
        File versionFile = new File(projectDir, ".payload_version");
        String current = String.valueOf(BuildConfig.VERSION_CODE);

        String installed = null;
        if (versionFile.exists()) {
            try {
                installed = readFile(versionFile).trim();
            } catch (Exception ignored) {}
        }

        boolean needsCopy = !new File(projectDir, "server.js").exists() || !current.equals(installed);
        if (!needsCopy) {
            return projectDir;
        }

        // Hapus hanya berkas payload; users.json/shares.json/config.json tetap dipertahankan.
        for (String item : PAYLOAD_ITEMS) {
            deleteRecursive(new File(projectDir, item));
        }
        if (!projectDir.exists() && !projectDir.mkdirs()) {
            throw new Exception("Gagal membuat folder: " + projectDir);
        }

        copyAssetDir("nodejs-project", projectDir.getAbsolutePath());

        try {
            writeFile(versionFile, current);
        } catch (Exception ignored) {}
        return projectDir;
    }

    private Notification buildNotification() {
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, new Intent(this, MainActivity.class), piFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        return builder
                .setContentTitle("KangManis aktif")
                .setContentText("Server berjalan di port 8080")
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    private void copyAssetDir(String assetPath, String outPath) throws Exception {
        String[] children = getAssets().list(assetPath);
        File out = new File(outPath);
        if (children != null && children.length > 0) {
            if (!out.exists() && !out.mkdirs()) {
                throw new Exception("Gagal membuat folder: " + outPath);
            }
            for (String child : children) {
                copyAssetDir(assetPath + "/" + child, outPath + "/" + child);
            }
        } else {
            File parent = out.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            InputStream in = getAssets().open(assetPath);
            OutputStream os = new FileOutputStream(out);
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) os.write(buffer, 0, n);
            os.close();
            in.close();
        }
    }

    private void deleteRecursive(File file) {
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursive(child);
            }
        }
        file.delete();
    }

    private String readFile(File file) throws Exception {
        InputStream in = new java.io.FileInputStream(file);
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[512];
        int n;
        while ((n = in.read(buffer)) > 0) bos.write(buffer, 0, n);
        in.close();
        return bos.toString("UTF-8");
    }

    private void writeFile(File file, String content) throws Exception {
        OutputStream os = new FileOutputStream(file);
        os.write(content.getBytes("UTF-8"));
        os.close();
    }
}
