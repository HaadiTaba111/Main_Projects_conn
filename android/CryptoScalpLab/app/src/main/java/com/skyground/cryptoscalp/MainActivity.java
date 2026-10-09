package com.skyground.cryptoscalp;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.floatingactionbutton.FloatingActionButton;

public class MainActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "CryptoScalpPrefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_URL = "http://10.1.19.2:8787";

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private LinearLayout errorLayout;
    private TextView errorDetailText;
    private MaterialButton btnRetry;
    private MaterialButton btnChangeIp;
    private FloatingActionButton fabSettings;
    private SharedPreferences prefs;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        errorLayout = findViewById(R.id.errorLayout);
        errorDetailText = findViewById(R.id.errorDetailText);
        btnRetry = findViewById(R.id.btnRetry);
        btnChangeIp = findViewById(R.id.btnChangeIp);
        fabSettings = findViewById(R.id.fabSettings);

        setupWebView();

        swipeRefresh.setOnRefreshListener(() -> {
            webView.reload();
        });

        btnRetry.setOnClickListener(v -> loadCurrentUrl());

        btnChangeIp.setOnClickListener(v -> showIpConfigDialog());

        fabSettings.setOnClickListener(v -> showIpConfigDialog());

        loadCurrentUrl();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebChromeClient(new WebChromeClient());

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                errorLayout.setVisibility(View.GONE);
                swipeRefresh.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefresh.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showErrorState();
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Allow local SSL/self-signed certs in lab environment
                handler.proceed();
            }
        });
    }

    private void showErrorState() {
        swipeRefresh.setRefreshing(false);
        swipeRefresh.setVisibility(View.GONE);
        errorLayout.setVisibility(View.VISIBLE);
        String currentUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_URL);
        errorDetailText.setText("تلاش برای اتصال به:\n" + currentUrl + "\n\nلطفاً مطمئن شوید سرور اجراست و گوشی به همان شبکه (PdaNet/Wi-Fi) متصل است.");
    }

    private void loadCurrentUrl() {
        String url = prefs.getString(KEY_SERVER_URL, DEFAULT_URL);
        errorLayout.setVisibility(View.GONE);
        swipeRefresh.setVisibility(View.VISIBLE);
        swipeRefresh.setRefreshing(true);
        webView.loadUrl(url);
    }

    private void showIpConfigDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("تنظیم آدرس سرور (Server URL)");

        final EditText input = new EditText(this);
        input.setSingleLine(true);
        String currentUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_URL);
        input.setText(currentUrl);
        input.setSelection(input.getText().length());
        builder.setView(input);

        builder.setPositiveButton("ذخیره و اتصال", (dialog, which) -> {
            String newUrl = input.getText().toString().trim();
            if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                newUrl = "http://" + newUrl;
            }
            prefs.edit().putString(KEY_SERVER_URL, newUrl).apply();
            Toast.makeText(MainActivity.this, "آدرس جدید: " + newUrl, Toast.LENGTH_SHORT).show();
            loadCurrentUrl();
        });

        builder.setNegativeButton("انصراف", (dialog, which) -> dialog.cancel());
        builder.show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
