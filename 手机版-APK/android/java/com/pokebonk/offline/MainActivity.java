package com.pokebonk.offline;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * PokéBonk 离线版（Android）
 *
 * 思路和电脑版一致：游戏文件全部打包进 APK，本地起一个「虚拟站点」pb.local；
 * 游戏里写死的 https://api.pokebonk.com 在返回 JS 时改写成 /api，交给页面里注入的
 * pb-api-shim.js（本地账号 + 存档 + 本地排名）。官网排行榜需要登录态且没有 CORS，
 * 由 Java 侧用 PBAndroid.officialGet() 同步取回，再交给 JS 合并排序。
 */
public class MainActivity extends Activity {

    private static final String SITE = "https://pb.local/";
    private static final String API = "https://api.pokebonk.com";
    private static final String API_FROM = "https://api.pokebonk.com";
    private static final String SHIM_ASSET = "pb-api-shim.js";
    private static final String PREFS = "pokebonk";
    private static final int CONNECT_TIMEOUT = 5000;
    private static final int READ_TIMEOUT = 8000;

    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#1a1630"));
        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        web.addJavascriptInterface(new Bridge(), "PBAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new LocalClient());
        WebView.setWebContentsDebuggingEnabled(true);

        web.loadUrl(SITE);
    }

    private void hideSystemUi() {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    // ------------------------------------------------------- 资源拦截 ----

    private class LocalClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                Uri uri = request.getUrl();
                if (uri == null || !"pb.local".equals(uri.getHost())) return null;
                return serve(uri.getPath());
            } catch (Throwable t) {
                return null;
            }
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            try {
                URL u = new URL(url);
                if (!"pb.local".equals(u.getHost())) return null;
                return serve(u.getPath());
            } catch (Throwable t) {
                return null;
            }
        }
    }

    private static String normalize(String raw) {
        String p = raw == null ? "" : raw;
        while (p.startsWith("/")) p = p.substring(1);
        // 游戏偶发会请求 /assets/assets/... 这种重复前缀
        while (p.startsWith("assets/assets/")) p = p.substring(7);
        while (p.startsWith("data/data/")) p = p.substring(5);
        if (p.isEmpty()) p = "index.html";
        if (p.endsWith("/")) p += "index.html";
        return p;
    }

    private WebResourceResponse serve(String rawPath) throws IOException {
        String rel = normalize(rawPath);
        Map<String, String> headers = new HashMap<>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-cache");

        // 本地 API 层
        if (rel.equals(SHIM_ASSET)) {
            byte[] data = readAsset(SHIM_ASSET);
            return resp("text/javascript", data, headers);
        }

        // 先看内部存储里的更新覆盖层（将来做增量更新用）
        File overlay = new File(new File(getFilesDir(), "overlay"), rel);
        byte[] data = null;
        if (overlay.isFile()) {
            data = readFile(overlay);
        } else {
            try {
                data = readAsset("web/" + rel);
            } catch (IOException notFound) {
                data = null;
            }
        }

        if (data == null) {
            // 单页应用路由（/legal 之类）回落到 index.html
            if (rel.indexOf('.') < 0) return serve("index.html");
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                    new ByteArrayInputStream(new byte[0]));
        }

        String lower = rel.toLowerCase();
        if (lower.endsWith(".js")) {
            String src = new String(data, StandardCharsets.UTF_8);
            String out = src;
            if (out.contains(API_FROM)) out = out.replace(API_FROM, "/api");
            out = applyViewportPatch(out);
            if (!out.equals(src)) data = out.getBytes(StandardCharsets.UTF_8);
            return resp("text/javascript", data, headers);
        }
        if (lower.endsWith(".html")) {
            String src = new String(data, StandardCharsets.UTF_8);
            src = src.replaceAll("(?s)<script[^>]*static\\.cloudflareinsights\\.com.*?</script>", "");
            StringBuilder inject = new StringBuilder();
            if (!src.contains(SHIM_ASSET)) {
                inject.append("<script src=\"/").append(SHIM_ASSET).append("\"></script>\n    ");
            }
            if (!src.contains("pb-compat")) {
                inject.append("<style id=\"pb-compat\">").append(compatCss()).append("</style>\n    ");
            }
            // 华为平板 DPR 2.5，device-width 只有 1024×640，比游戏基础布局需要的 ~740px 矮，
            // 导致上下内容被裁（居中的 flex 容器上下同时溢出）。这里按平板常见的
            // 1280×800 CSS 视口渲染，与游戏设计时的尺寸一致。
            src = src.replaceAll("(?i)<meta[^>]*name=\"viewport\"[^>]*>",
                    java.util.regex.Matcher.quoteReplacement(
                            "<meta name=\"viewport\" content=\"width=1280, viewport-fit=cover, user-scalable=no\">"));
            if (inject.length() > 0) {
                // 用字符串插入而不是正则替换，避免 $ 被当成组引用
                int head = src.toLowerCase().indexOf("<head");
                if (head >= 0) {
                    int close = src.indexOf('>', head);
                    if (close > 0) {
                        src = src.substring(0, close + 1) + "\n    " + inject + src.substring(close + 1);
                    }
                }
            }
            data = src.getBytes(StandardCharsets.UTF_8);
            return resp("text/html", data, headers);
        }

        return new WebResourceResponse(mimeOf(rel), null, 200, "OK", headers, new ByteArrayInputStream(data));
    }

    private WebResourceResponse resp(String mime, byte[] data, Map<String, String> headers) {
        return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, new ByteArrayInputStream(data));
    }

    private static String mimeOf(String rel) {
        String l = rel.toLowerCase();
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
        if (l.endsWith(".webp")) return "image/webp";
        if (l.endsWith(".gif")) return "image/gif";
        if (l.endsWith(".ico")) return "image/x-icon";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".json") || l.endsWith(".webmanifest") || l.endsWith(".map")) return "application/json";
        if (l.endsWith(".glb")) return "model/gltf-binary";
        if (l.endsWith(".ogg") || l.endsWith(".oga")) return "audio/ogg";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        if (l.endsWith(".wav")) return "audio/wav";
        if (l.endsWith(".woff2")) return "font/woff2";
        if (l.endsWith(".woff")) return "font/woff";
        if (l.endsWith(".ttf")) return "font/ttf";
        if (l.endsWith(".txt") || l.endsWith(".xml")) return "text/plain";
        return "application/octet-stream";
    }

    private byte[] readAsset(String name) throws IOException {
        try (InputStream is = new BufferedInputStream(getAssets().open(name))) {
            return drain(is);
        }
    }

    /** Chromium 旧内核兼容补丁（lib/pb-compat.css，构建时打进 assets）。 */
    private static String COMPAT_CSS = null;

    /**
     * 游戏自带的“短屏放宽虚拟视口”逻辑只对短边 &lt;480px 的手机生效。
     * 平板（2560×1600 / DPR2.5 → 1024×640 CSS px）短边 640，装不下基础布局，
     * 界面上下会被裁。这里让平板也走放宽分支（1280×800）。
     */
    private static final java.util.regex.Pattern VIEWPORT_RE =
            java.util.regex.Pattern.compile("(\\w+)=480,(\\w+)=1100");

    private static String applyViewportPatch(String src) {
        java.util.regex.Matcher m = VIEWPORT_RE.matcher(src);
        if (!m.find()) return src;
        return m.replaceFirst("$1=(screen.width>=900?820:480),$2=(screen.width>=900?1280:1100)");
    }

    private String compatCss() {
        if (COMPAT_CSS == null) {
            try {
                COMPAT_CSS = new String(readAsset("pb-compat.css"), StandardCharsets.UTF_8);
            } catch (IOException e) {
                COMPAT_CSS = "";
            }
        }
        return COMPAT_CSS;
    }

    private byte[] readFile(File f) throws IOException {
        try (InputStream is = new BufferedInputStream(new FileInputStream(f))) {
            return drain(is);
        }
    }

    private static byte[] drain(InputStream is) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(64 * 1024);
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    // ------------------------------------------------- 官网榜单桥接 ----

    /**
     * 暴露给页面：PBAndroid.officialGet('/leaderboard?...')
     * 同步返回响应体；失败返回空串（JS 侧会回退到本地缓存或纯本地榜）。
     */
    private class Bridge {
        @JavascriptInterface
        public String officialGet(String path) {
            try {
                if (path == null || !path.startsWith("/")) return "";
                String token = token();
                String body = httpGet(API + path, token);
                if (body == null) {
                    token = newGuest();
                    if (token == null) return "";
                    body = httpGet(API + path, token);
                }
                return body == null ? "" : body;
            } catch (Throwable t) {
                return "";
            }
        }

        @JavascriptInterface
        public String info() {
            return "{\"package\":\"" + getPackageName() + "\",\"sdk\":" + Build.VERSION.SDK_INT + "}";
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String token() {
        String t = prefs().getString("officialToken", null);
        if (t != null) return t;
        return newGuest();
    }

    private String newGuest() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(API + "/auth/guest").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(CONNECT_TIMEOUT);
            c.setReadTimeout(READ_TIMEOUT);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            commonHeaders(c);
            try (OutputStream os = c.getOutputStream()) {
                os.write("{}".getBytes(StandardCharsets.UTF_8));
            }
            if (c.getResponseCode() / 100 != 2) return null;
            String body = new String(drain(c.getInputStream()), StandardCharsets.UTF_8);
            String t = new JSONObject(body).optString("token", null);
            if (t != null) prefs().edit().putString("officialToken", t).apply();
            return t;
        } catch (Throwable t) {
            return null;
        }
    }

    private String httpGet(String url, String bearer) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(CONNECT_TIMEOUT);
            c.setReadTimeout(READ_TIMEOUT);
            commonHeaders(c);
            if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
            int code = c.getResponseCode();
            if (code == 401 || code == 403) return null;
            if (code / 100 != 2) return null;
            return new String(drain(c.getInputStream()), StandardCharsets.UTF_8);
        } catch (Throwable t) {
            return null;
        }
    }

    private static void commonHeaders(HttpURLConnection c) {
        c.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36");
        c.setRequestProperty("Origin", "https://pokebonk.com");
        c.setRequestProperty("Referer", "https://pokebonk.com/");
        c.setRequestProperty("Accept", "application/json");
    }
}