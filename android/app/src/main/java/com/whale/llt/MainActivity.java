package com.whale.llt;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {

    // 权限请求码
    private static final int FILE_STORAGE_PERMISSION_CODE = 101;
    private static final int MICROPHONE_PERMISSION_CODE = 102;
    private static final int NOTIFICATION_PERMISSION_CODE = 103;

    // 用于暂存JS传过来的文件数据和名称
    private String pendingFileData = null;
    private String pendingFileName = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. 开启 WebView 调试
        WebView.setWebContentsDebuggingEnabled(true);
        
        // 2. 注入你的 JS 接口 (导出文件用)
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new WebAppInterface(), "Android");

        // 3. 【核心回归】：这里不再手动设置 setWebChromeClient
        // 既然老版本是正常的，我们就信任 Capacitor (BridgeActivity) 自带的处理逻辑。
        // 它会自动处理 <input type="file"> 的点击事件。

        // 4. 启动时主动检查权限
        // (这一步是必须的，因为如果 App 没有系统层面的麦克风权限，Capacitor 也无能为力)
        checkMicrophonePermission();
        checkNotificationPermission();
    }

    // ===================================================================
    // 权限检查逻辑 (保持不变)
    // ===================================================================
    private void checkMicrophonePermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION_CODE);
        }
    }

    private void checkNotificationPermission() {
        // Android 13+ 需要通知权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_CODE);
            }
        }
    }

    // ===================================================================
    // 权限回调处理
    // ===================================================================
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults); // 重要：交给父类处理其他可能的权限

        if (requestCode == MICROPHONE_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Toast.makeText(this, "麦克风权限已授予", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "麦克风权限被拒绝", Toast.LENGTH_LONG).show();
            }
        }
        else if (requestCode == NOTIFICATION_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                // 通知权限已授予
            }
        }
        else if (requestCode == FILE_STORAGE_PERMISSION_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                saveToFileLegacy();
            } else {
                Toast.makeText(this, "存储权限被拒绝", Toast.LENGTH_LONG).show();
                pendingFileData = null;
                pendingFileName = null;
            }
        }
    }

    // ===================================================================
    // 文件保存逻辑 (导出文件，保持原样，这部分是好的)
    // ===================================================================

    public class WebAppInterface {
        @JavascriptInterface
        public void saveFile(String data, String filename) {
            pendingFileData = data;
            pendingFileName = filename;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveFileUsingMediaStore();
            } else {
                checkPermissionAndSaveLegacy();
            }
        }
    }

    private void saveFileUsingMediaStore() {
        if (pendingFileData == null || pendingFileName == null) return;
        ContentResolver resolver = getContentResolver();
        ContentValues contentValues = new ContentValues();
        contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, pendingFileName);
        
        if (pendingFileName.endsWith(".json")) {
            contentValues.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
        } else {
            contentValues.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
        }
        contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        
        android.net.Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
            if (uri == null) throw new IOException("Failed to create new MediaStore record.");
            try (OutputStream outputStream = resolver.openOutputStream(uri)) {
                if (outputStream == null) throw new IOException("Failed to get output stream.");
                outputStream.write(pendingFileData.getBytes());
            }
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "文件已保存到 Download/" + pendingFileName, Toast.LENGTH_LONG).show());
        } catch (IOException e) {
            Log.e("FileSaveError", "使用 MediaStore 保存文件失败", e);
            if (uri != null) resolver.delete(uri, null, null);
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "文件保存失败: " + e.getMessage(), Toast.LENGTH_LONG).show());
        } finally {
            pendingFileData = null;
            pendingFileName = null;
        }
    }

    private void checkPermissionAndSaveLegacy() {
        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_DENIED) {
            ActivityCompat.requestPermissions(MainActivity.this, new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, FILE_STORAGE_PERMISSION_CODE);
        } else {
            saveToFileLegacy();
        }
    }

    private void saveToFileLegacy() {
        if (pendingFileData == null || pendingFileName == null) return;
        File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!downloadsDir.exists()) {
            downloadsDir.mkdirs();
        }
        File file = new File(downloadsDir, pendingFileName);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            fos.write(pendingFileData.getBytes());
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "文件已保存到 Download/" + pendingFileName, Toast.LENGTH_LONG).show());
        } catch (IOException e) {
            Log.e("FileSaveError", "旧版文件保存失败", e);
            runOnUiThread(() -> Toast.makeText(MainActivity.this, "文件保存失败: " + e.getMessage(), Toast.LENGTH_LONG).show());
        } finally {
            pendingFileData = null;
            pendingFileName = null;
        }
    }
}
