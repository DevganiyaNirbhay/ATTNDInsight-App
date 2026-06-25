package com.example.attndinsight;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final int STORAGE_PERMISSION_CODE = 101;
    private static final String WEB_URL = "file:///android_asset/PrincipalDashboard.html";

    // Variables to store pending download data if permission is needed
    private String pendingBase64Data;
    private String pendingMimeType;
    private String pendingFileName;
    private boolean isStandardDownload = false;
    private String pendingUrl, pendingUserAgent, pendingContentDisposition;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Yahan Interface add kiya
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidDownloader");

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (checkStoragePermission()) {
                handleDownload(url, userAgent, contentDisposition, mimetype);
            } else {
                pendingUrl = url;
                pendingUserAgent = userAgent;
                pendingContentDisposition = contentDisposition;
                pendingMimeType = mimetype;
                isStandardDownload = true;
                requestStoragePermission();
            }
        });

        webView.loadUrl(WEB_URL);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null) {
                    webView.evaluateJavascript(
                            "(function() {" +
                                    "  if (!document.getElementById('customDialogOverlay').classList.contains('hidden')) { closeCustomDialog(); return 'dialog'; }" +
                                    "  if (!document.getElementById('editProfileOverlay').classList.contains('hidden')) { closeEditProfileDialog(); return 'dialog'; }" +
                                    "  if (!document.getElementById('exportDialogOverlay').classList.contains('hidden')) { closeExportDialog(); return 'dialog'; }" +
                                    "  if (document.getElementById('dropdownOverlay').style.display === 'block') { closeDropdown(); return 'dialog'; }" +
                                    "  return window.location.hash;" +
                                    "})()",
                            value -> {
                                String result = (value != null) ? value.replace("\"", "") : "";

                                if (result.equals("dialog")) {
                                    // Dialog was dismissed, do nothing else
                                } else if (result.equals("#overall_view")) {
                                    webView.loadUrl("javascript:requestNavigate('overall_setup')");
                                } else if (result.equals("#faculty") || result.isEmpty() || result.equals("null")) {
                                    setEnabled(false);
                                    getOnBackPressedDispatcher().onBackPressed();
                                    setEnabled(true);
                                } else {
                                    webView.loadUrl("javascript:requestNavigate('faculty')");
                                }
                            }
                    );
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    private void handleDownload(String url, String userAgent, String contentDisposition, String mimetype) {
        if (url.startsWith("blob:")) {
            webView.evaluateJavascript(getBase64StringFromBlobUrl(url, mimetype, URLUtil.guessFileName(url, contentDisposition, mimetype)), null);
        } else {
            startStandardDownload(url, userAgent, mimetype, URLUtil.guessFileName(url, contentDisposition, mimetype));
        }
    }

    // --- Bridge class (Yahan saare methods Sahi tarike se band kiye hain) ---
    public class WebAppInterface {
        Context mContext;
        WebAppInterface(Context c) { mContext = c; }

        @JavascriptInterface
        public void saveBase64File(String base64Data, String mimeType, String fileName) {
            if (checkStoragePermission()) {
                processBase64Data(base64Data, mimeType, fileName);
            } else {
                pendingBase64Data = base64Data;
                pendingMimeType = mimeType;
                pendingFileName = fileName;
                isStandardDownload = false;
                requestStoragePermission();
            }
        }

        @JavascriptInterface
        public boolean fileExists(String fileName) {
            try {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "ATTND_Insight");
                File file = new File(dir, fileName);
                return file.exists();
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void openFileManager() {
            try {
                // Ensure directory exists
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "ATTND_Insight");
                if (!dir.exists()) dir.mkdirs();

                // On many Android versions, we can't reliably open a specific folder in the system file manager 
                // using just a VIEW intent with a custom URI.
                // We'll try a broad VIEW intent first, then fallback to a generic picker.
                
                Intent intent = new Intent(Intent.ACTION_VIEW);
                Uri uri = Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADocuments%2FATTND_Insight");
                intent.setDataAndType(uri, "vnd.android.document/directory");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                if (intent.resolveActivity(getPackageManager()) == null) {
                    // Fallback: Open general file picker
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                }

                try {
                    mContext.startActivity(intent);
                } catch (Exception e) {
                    MainActivity.this.runOnUiThread(() -> 
                        Toast.makeText(mContext, "Could not open File Manager. Please go to Documents/ATTND_Insight manually.", Toast.LENGTH_LONG).show()
                    );
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void processBase64Data(String base64Data, String mimeType, String fileName) {
        try {
            String base64String = base64Data.substring(base64Data.indexOf(",") + 1);
            byte[] fileBytes = Base64.decode(base64String, Base64.DEFAULT);
            String finalFileName = fileName.replace(".bin", mimeType.contains("pdf") ? ".pdf" : ".xlsx");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Use MediaStore for Android 10+
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, finalFileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOCUMENTS + "/ATTND_Insight");

                Uri uri = getContentResolver().insert(MediaStore.Files.getContentUri("external"), values);
                if (uri != null) {
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        if (os != null) {
                            os.write(fileBytes);
                            runOnUiThread(() -> Toast.makeText(this, "Saved to Documents/ATTND_Insight", Toast.LENGTH_SHORT).show());
                        }
                    }
                } else {
                    runOnUiThread(() -> Toast.makeText(this, "Failed to create file", Toast.LENGTH_SHORT).show());
                }
            } else {
                // Older Android versions
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "ATTND_Insight");
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, finalFileName);
                try (FileOutputStream os = new FileOutputStream(file)) {
                    os.write(fileBytes);
                }
                runOnUiThread(() -> Toast.makeText(this, "Saved to Documents/ATTND_Insight", Toast.LENGTH_SHORT).show());
            }
        } catch (Exception e) {
            e.printStackTrace();
            runOnUiThread(() -> Toast.makeText(this, "Error saving file: " + e.getMessage(), Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == STORAGE_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (isStandardDownload) {
                    if (pendingUrl != null) {
                        handleDownload(pendingUrl, pendingUserAgent, pendingContentDisposition, pendingMimeType);
                    }
                } else {
                    if (pendingBase64Data != null) {
                        processBase64Data(pendingBase64Data, pendingMimeType, pendingFileName);
                    }
                }
                // Clear pending data
                pendingBase64Data = null;
                pendingUrl = null;
            } else {
                Toast.makeText(this, "Storage Permission Required to Download", Toast.LENGTH_LONG).show();
            }
        }
    }

    private String getBase64StringFromBlobUrl(String blobUrl, String mimeType, String fileName) {
        return "javascript: var xhr = new XMLHttpRequest(); xhr.open('GET', '" + blobUrl + "', true); xhr.responseType = 'blob'; xhr.onload = function(e) { var reader = new FileReader(); reader.readAsDataURL(this.response); reader.onloadend = function() { AndroidDownloader.saveBase64File(reader.result, '" + mimeType + "', '" + fileName + "'); } }; xhr.send();";
    }

    private void startStandardDownload(String url, String userAgent, String mimetype, String fileName) {
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOCUMENTS, "ATTND_Insight/" + fileName);
        ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
    }

    private boolean checkStoragePermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestStoragePermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q)
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, STORAGE_PERMISSION_CODE);
    }
}