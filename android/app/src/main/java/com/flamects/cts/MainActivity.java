package com.flamects.cts;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.print.PdfExporter;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Log;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Flame CTS on Android: shows the same page as the PC app, with live data
 * from Supabase. The page is served from inside the app at
 * https://appassets.androidplatform.net/app/ (a fixed origin, so the login
 * and the offline copy kept in localStorage survive restarts). A newer page
 * published as a GitHub release is downloaded in the background and the
 * page's own Update bar offers "Restart now", exactly like the PC app.
 */
public class MainActivity extends Activity {
  static final String HOST = "appassets.androidplatform.net";
  static final String START = "https://" + HOST + "/app/index.html";
  static final String REPO = "https://github.com/flameservice2/flamects-desktop";
  static final String SHELL_INFO = "https://raw.githubusercontent.com/flameservice2/flamects-desktop/main/android/latest.json";
  static final long CHECK_EVERY = 10 * 60 * 1000L, CHECK_ON_RESUME = 5 * 60 * 1000L;
  static final int REQ_FILE = 7;
  static final Pattern VER = Pattern.compile("<meta name=\"flame-version\" content=\"([0-9.]+)\">");

  WebView web;
  final Handler ui = new Handler(Looper.getMainLooper());
  ValueCallback<Uri[]> fileCb;
  String loadedVersion = "", readyVersion = null, bundledVersion = null;
  volatile boolean checking = false;
  long lastCheck = 0;
  boolean shellOffered = false;

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    web.setBackgroundColor(0xFF1F1915);
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setTextZoom(100);
    s.setSupportZoom(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    s.setMediaPlaybackRequiresUserGesture(true);
    web.addJavascriptInterface(new Bridge(), "FlameAndroid");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (!HOST.equals(u.getHost())) return null;
        return serve(u.getPath());
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (HOST.equals(u.getHost())) return false;
        openExternal(u.toString());
        return true;
      }
      @Override public void onPageFinished(WebView v, String url) {
        if (readyVersion != null) tellReady();
        // Smoke test used by the Android workflow on an emulator:
        // am start -n com.flamects.cts/.MainActivity --ez selftest true
        if (getIntent() != null && getIntent().getBooleanExtra("selftest", false)) {
          v.evaluateJavascript("console.log('SELFTEST page ' + (document.querySelector('meta[name=flame-version]')||{}).content + ' shim ' + !!(window.flameDesktop&&window.flameDesktop.android) + ' supabase ' + typeof window.supabase);" +
            "window.flameDesktop.savePdf('selftest').then(function(p){console.log('SELFTEST pdf ok '+p)}, function(e){console.log('SELFTEST pdf fail '+e)})", null);
        }
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (fileCb != null) fileCb.onReceiveValue(null);
        fileCb = cb;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(Intent.createChooser(i, "Choose a file"), REQ_FILE); }
        catch (ActivityNotFoundException e) { fileCb = null; return false; }
        return true;
      }
    });
    web.setDownloadListener((url, ua, cd, mime, len) -> {
      if (url.startsWith("http")) openExternal(url);
    });
    if (state != null) web.restoreState(state);
    else web.loadUrl(START);
    ui.postDelayed(this::periodicCheck, 8000);
  }

  void periodicCheck() {
    checkForUpdates();
    ui.postDelayed(this::periodicCheck, CHECK_EVERY);
  }

  @Override protected void onResume() {
    super.onResume();
    if (lastCheck > 0 && System.currentTimeMillis() - lastCheck > CHECK_ON_RESUME) checkForUpdates();
  }

  @Override protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override protected void onActivityResult(int req, int res, Intent data) {
    if (req == REQ_FILE) {
      if (fileCb != null) {
        Uri[] picked = null;
        if (res == RESULT_OK && data != null) {
          if (data.getClipData() != null) {
            picked = new Uri[data.getClipData().getItemCount()];
            for (int i = 0; i < picked.length; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
          } else if (data.getData() != null) picked = new Uri[]{data.getData()};
        }
        fileCb.onReceiveValue(picked);
        fileCb = null;
      }
      return;
    }
    super.onActivityResult(req, res, data);
  }

  // Back closes an open dialog or the menu, then returns to the Dashboard,
  // then leaves the app running in the background.
  @Override public void onBackPressed() {
    web.evaluateJavascript("window.__flameBack ? window.__flameBack() : false", v -> {
      if (!"true".equals(v)) moveTaskToBack(true);
    });
  }

  /* ---------------- serving the page ---------------- */

  File pageFile() { return new File(getFilesDir(), "page/index.html"); }

  static String versionOf(String html) {
    Matcher m = VER.matcher(html);
    return m.find() ? m.group(1) : "0";
  }

  static int cmpVer(String a, String b) {
    String[] x = a.split("\\."), y = b.split("\\.");
    for (int i = 0; i < Math.max(x.length, y.length); i++) {
      int p = i < x.length ? parseInt(x[i]) : 0, q = i < y.length ? parseInt(y[i]) : 0;
      if (p != q) return p < q ? -1 : 1;
    }
    return 0;
  }

  static int parseInt(String s) { try { return Integer.parseInt(s); } catch (Exception e) { return 0; } }

  static byte[] readAll(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buf = new byte[65536];
    int n;
    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    in.close();
    return out.toByteArray();
  }

  synchronized String bundledVersion() {
    if (bundledVersion == null) {
      try { bundledVersion = versionOf(new String(readAll(getAssets().open("app/index.html")), StandardCharsets.UTF_8)); }
      catch (IOException e) { bundledVersion = "0"; }
    }
    return bundledVersion;
  }

  String downloadedVersion() {
    File f = new File(getFilesDir(), "page/version.txt");
    if (!f.exists() || !pageFile().exists()) return "0";
    try { return new String(readAll(new java.io.FileInputStream(f)), StandardCharsets.UTF_8).trim(); }
    catch (IOException e) { return "0"; }
  }

  /** The newest page on this phone: the one in the APK or a downloaded one. */
  String newestVersion() {
    String b = bundledVersion(), d = downloadedVersion();
    return cmpVer(d, b) > 0 ? d : b;
  }

  WebResourceResponse serve(String path) {
    try {
      if (path == null || !path.startsWith("/app/") || path.contains("..")) return notFound();
      String rel = path.substring(5);
      if (rel.isEmpty() || rel.equals("index.html")) {
        String html;
        String d = downloadedVersion();
        if (cmpVer(d, bundledVersion()) > 0) html = new String(readAll(new java.io.FileInputStream(pageFile())), StandardCharsets.UTF_8);
        else html = new String(readAll(getAssets().open("app/index.html")), StandardCharsets.UTF_8);
        loadedVersion = versionOf(html);
        if (readyVersion != null && cmpVer(readyVersion, loadedVersion) <= 0) readyVersion = null;
        String shim = new String(readAll(getAssets().open("shim.js")), StandardCharsets.UTF_8);
        html = html.replaceFirst("<head>", "<head>\n<script>" + java.util.regex.Matcher.quoteReplacement(shim) + "</script>");
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/html", "utf-8", 200, "OK", h, new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
      }
      InputStream in = getAssets().open("app/" + rel);
      return new WebResourceResponse(mimeOf(rel), null, in);
    } catch (IOException e) {
      return notFound();
    }
  }

  static WebResourceResponse notFound() {
    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
  }

  static String mimeOf(String name) {
    String n = name.toLowerCase();
    if (n.endsWith(".html")) return "text/html";
    if (n.endsWith(".js")) return "text/javascript";
    if (n.endsWith(".css")) return "text/css";
    if (n.endsWith(".woff2")) return "font/woff2";
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".svg")) return "image/svg+xml";
    if (n.endsWith(".json")) return "application/json";
    if (n.endsWith(".pdf")) return "application/pdf";
    if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (n.endsWith(".xls")) return "application/vnd.ms-excel";
    if (n.endsWith(".csv")) return "text/csv";
    return "application/octet-stream";
  }

  /* ---------------- updates ---------------- */

  void checkForUpdates() {
    if (checking) return;
    checking = true;
    lastCheck = System.currentTimeMillis();
    new Thread(() -> {
      try { updatePage(); } catch (Exception e) { /* offline: try again later */ }
      try { checkShell(); } catch (Exception e) { /* offline */ }
      checking = false;
    }).start();
  }

  static HttpURLConnection open(String url, boolean follow) throws IOException {
    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
    c.setInstanceFollowRedirects(follow);
    c.setConnectTimeout(20000);
    c.setReadTimeout(60000);
    c.setRequestProperty("User-Agent", "FlameCTS-Android");
    c.setUseCaches(false);
    return c;
  }

  /** Newest release tag, read from where /releases/latest redirects (no API limits). */
  static String latestTag() throws IOException {
    HttpURLConnection c = open(REPO + "/releases/latest", false);
    try {
      c.getResponseCode();
      String loc = c.getHeaderField("Location");
      if (loc == null || !loc.contains("/releases/tag/")) return null;
      return loc.substring(loc.lastIndexOf('/') + 1);
    } finally { c.disconnect(); }
  }

  void updatePage() throws IOException {
    String tag = latestTag();
    if (tag == null) return;
    String ver = tag.startsWith("v") ? tag.substring(1) : tag;
    if (cmpVer(ver, newestVersion()) > 0) {
      HttpURLConnection c = open(REPO + "/releases/download/" + tag + "/FlameCTS-app.html", true);
      try {
        if (c.getResponseCode() != 200) return;
        byte[] body = readAll(c.getInputStream());
        String html = new String(body, StandardCharsets.UTF_8);
        if (!ver.equals(versionOf(html)) || !html.trim().endsWith("</html>")) return;   // incomplete or wrong file
        File dir = new File(getFilesDir(), "page");
        dir.mkdirs();
        File tmp = new File(dir, "index.html.tmp");
        try (OutputStream o = new FileOutputStream(tmp)) { o.write(body); }
        if (!tmp.renameTo(pageFile())) return;
        try (OutputStream o = new FileOutputStream(new File(dir, "version.txt"))) { o.write(ver.getBytes(StandardCharsets.UTF_8)); }
      } finally { c.disconnect(); }
    }
    String newest = newestVersion();
    if (!loadedVersion.isEmpty() && cmpVer(newest, loadedVersion) > 0) {
      readyVersion = newest;
      ui.post(this::tellReady);
    }
  }

  void tellReady() {
    if (readyVersion == null) return;
    web.evaluateJavascript("window.__flameUpdateReady && window.__flameUpdateReady(" + JSONObject.quote(readyVersion) + ")", null);
  }

  /** The Android app itself rarely changes; when it does, offer the new APK once per run. */
  void checkShell() throws Exception {
    if (shellOffered) return;
    HttpURLConnection c = open(SHELL_INFO + "?t=" + System.currentTimeMillis(), true);
    JSONObject j;
    try {
      if (c.getResponseCode() != 200) return;
      j = new JSONObject(new String(readAll(c.getInputStream()), StandardCharsets.UTF_8));
    } finally { c.disconnect(); }
    int code = j.optInt("versionCode", 0);
    final String apk = j.optString("apk", "");
    int mine = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
    if (code <= mine || apk.isEmpty()) return;
    SharedPreferences p = getSharedPreferences("flame", MODE_PRIVATE);
    long last = p.getLong("shellAsked", 0);
    if (System.currentTimeMillis() - last < 20 * 3600 * 1000L) return;
    shellOffered = true;
    ui.post(() -> {
      p.edit().putLong("shellAsked", System.currentTimeMillis()).apply();
      new AlertDialog.Builder(this)
        .setTitle("New Flame CTS app")
        .setMessage("A newer version of the Flame CTS phone app is available. Download and install it now? Your data stays as it is.")
        .setPositiveButton("Download", (d, w) -> openExternal(apk))
        .setNegativeButton("Later", null)
        .show();
    });
  }

  /* ---------------- files, printing, sharing ---------------- */

  void openExternal(String url) {
    try {
      Uri u = Uri.parse(url);
      String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
      Intent i;
      if (sc.equals("mailto")) i = new Intent(Intent.ACTION_SENDTO, u);
      else if (sc.equals("http") || sc.equals("https") || sc.equals("tel") || sc.equals("whatsapp") || sc.equals("sms") || sc.equals("geo")) i = new Intent(Intent.ACTION_VIEW, u);
      else return;
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(i);
    } catch (ActivityNotFoundException e) {
      Toast.makeText(this, "No app on this phone can open that link.", Toast.LENGTH_LONG).show();
    }
  }

  File sharedDir() {
    File d = new File(getCacheDir(), "shared");
    d.mkdirs();
    return d;
  }

  static String safeName(String name, String ext) {
    String n = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", " ").trim();
    if (n.isEmpty()) n = "document";
    if (n.length() > 100) n = n.substring(0, 100).trim();
    if (ext != null && !n.toLowerCase().endsWith(ext)) n += ext;
    return n;
  }

  Uri shareUri(File f) { return Uri.parse("content://com.flamects.cts.files/" + Uri.encode(f.getName())); }

  void js(String code) { ui.post(() -> web.evaluateJavascript(code, null)); }

  PrintAttributes a4(boolean landscape) {
    return new PrintAttributes.Builder()
      .setMediaSize(landscape ? PrintAttributes.MediaSize.ISO_A4.asLandscape() : PrintAttributes.MediaSize.ISO_A4)
      .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
      .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
      .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
      .build();
  }

  class Bridge {
    @JavascriptInterface public void checkForUpdates() { ui.post(MainActivity.this::checkForUpdates); }

    @JavascriptInterface public void restartToUpdate() {
      ui.post(() -> { readyVersion = null; web.loadUrl(START); });
    }

    @JavascriptInterface public String info() {
      try {
        return new JSONObject()
          .put("app", getPackageManager().getPackageInfo(getPackageName(), 0).versionName)
          .put("page", loadedVersion).toString();
      } catch (Exception e) { return "{}"; }
    }

    @JavascriptInterface public void openExternal(String url) { ui.post(() -> MainActivity.this.openExternal(url)); }

    @JavascriptInterface public void print(String title, boolean landscape) {
      ui.post(() -> {
        String t = safeName(title == null ? "Flame CTS" : title, null);
        PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
        PrintDocumentAdapter ad = web.createPrintDocumentAdapter(t);
        pm.print(t, ad, new PrintAttributes.Builder()
          .setMediaSize(landscape ? PrintAttributes.MediaSize.ISO_A4.asLandscape() : PrintAttributes.MediaSize.ISO_A4).build());
      });
    }

    /** Renders what the page would print into a PDF file; answers through __flameCb. */
    @JavascriptInterface public void savePdf(String name, boolean landscape, String cb) {
      ui.post(() -> {
        File out = new File(sharedDir(), safeName(name, ".pdf"));
        PrintDocumentAdapter ad = web.createPrintDocumentAdapter(out.getName());
        PdfExporter.export(ad, a4(landscape), out, (ok, err) -> {
          Log.i("FlameCTS", "savePdf " + ok + " " + out.length() + " bytes " + (err == null ? "" : err));
          js("window.__flameCb(" + JSONObject.quote(cb) + "," + ok + "," + JSONObject.quote(ok ? out.getAbsolutePath() : String.valueOf(err)) + ")");
        });
      });
    }

    /** Sends a PDF made by savePdf to WhatsApp or an email app, with the message text. */
    @JavascriptInterface public void sharePdf(String path, String kind, String to, String subject, String text) {
      ui.post(() -> {
        File f = new File(path);
        if (!f.getParentFile().equals(sharedDir()) || !f.exists()) return;
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("application/pdf");
        i.putExtra(Intent.EXTRA_STREAM, shareUri(f));
        i.putExtra(Intent.EXTRA_TEXT, text);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if ("wa".equals(kind)) {
          String digits = to == null ? "" : to.replaceAll("\\D", "");
          if (digits.length() == 8) digits = "974" + digits;   // a Qatar number typed without the country code
          if (!digits.isEmpty()) i.putExtra("jid", digits + "@s.whatsapp.net");
          for (String pkg : new String[]{"com.whatsapp", "com.whatsapp.w4b"}) {
            try { i.setPackage(pkg); startActivity(i); return; } catch (ActivityNotFoundException e) { /* try the next */ }
          }
          i.setPackage(null);
          startActivity(Intent.createChooser(i, "Share quotation"));
        } else {
          if (to != null && !to.isEmpty()) i.putExtra(Intent.EXTRA_EMAIL, new String[]{to});
          i.putExtra(Intent.EXTRA_SUBJECT, subject);
          startActivity(Intent.createChooser(i, "Send by email"));
        }
      });
    }

    /** A file the page wants to download (Excel, PDF exports): keep it in Downloads and offer to share it. */
    @JavascriptInterface public void saveFile(String name, String mime, String b64) {
      final byte[] data;
      try { data = Base64.decode(b64, Base64.DEFAULT); } catch (IllegalArgumentException e) { return; }
      final String n = safeName(name, null);
      final String type = mime == null || mime.isEmpty() || mime.equals("application/octet-stream") ? mimeOf(n) : mime;
      ui.post(() -> {
        try {
          File f = new File(sharedDir(), n);
          try (OutputStream o = new FileOutputStream(f)) { o.write(data); }
          boolean inDownloads = false;
          if (Build.VERSION.SDK_INT >= 29) {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, n);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, type);
            Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (u != null) {
              try (OutputStream o = getContentResolver().openOutputStream(u)) { o.write(data); inDownloads = true; }
            }
          }
          Toast.makeText(MainActivity.this, inDownloads ? n + " saved in Downloads." : n + " is ready.", Toast.LENGTH_LONG).show();
          Intent i = new Intent(Intent.ACTION_SEND);
          i.setType(type);
          i.putExtra(Intent.EXTRA_STREAM, shareUri(f));
          i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
          startActivity(Intent.createChooser(i, "Open or share " + n));
        } catch (Exception e) {
          Toast.makeText(MainActivity.this, "Could not save " + n + ".", Toast.LENGTH_LONG).show();
        }
      });
    }
  }
}
