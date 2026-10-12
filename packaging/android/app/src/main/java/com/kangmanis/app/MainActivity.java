package com.kangmanis.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String URL = "http://127.0.0.1:8080";
    private WebView webView;
    private ProgressBar progress;
    private volatile boolean loaded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 33) {
            try {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
            } catch (Throwable ignored) {}
        }

        FrameLayout root = new FrameLayout(this);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        Button open = new Button(this);
        open.setText("Buka di Browser");
        open.setTextSize(12f);
        FrameLayout.LayoutParams openParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        openParams.gravity = Gravity.TOP | Gravity.END;
        openParams.setMargins(24, 24, 24, 24);
        open.setLayoutParams(openParams);
        open.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(URL)));
            }
        });
        root.addView(open);

        progress = new ProgressBar(this);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        progressParams.gravity = Gravity.CENTER;
        progress.setLayoutParams(progressParams);
        root.addView(progress);

        setContentView(root);

        startNodeService();
        waitForServerAndLoad();
    }

    private void startNodeService() {
        Intent service = new Intent(this, NodeService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(service);
        } else {
            startService(service);
        }
    }

    private void waitForServerAndLoad() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                long deadline = System.currentTimeMillis() + 60000;
                boolean up = false;
                while (System.currentTimeMillis() < deadline) {
                    up = isServerUp();
                    if (up) break;
                    try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
                }
                final boolean ready = up;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        progress.setVisibility(View.GONE);
                        if (ready) {
                            loaded = true;
                            webView.loadUrl(URL);
                        }
                    }
                });
            }
        }, "kangmanis-wait").start();
    }

    private boolean isServerUp() {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(URL + "/api/app-info").openConnection();
            conn.setConnectTimeout(1500);
            conn.setReadTimeout(1500);
            int code = conn.getResponseCode();
            conn.disconnect();
            return code > 0;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
