package com.abhishek.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Files ko seedha phone ke Downloads/ABHISHEK folder me save karta hai.
 * Android 10+ par permission nahi chahiye (MediaStore). Android 9 aur purane par storage permission maangta hai.
 */
@CapacitorPlugin(
    name = "FileSaver",
    permissions = {
        @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage")
    }
)
public class FileSaverPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            doSave(call);
        } else {
            call.reject("Storage permission nahi mili. Phone Settings > Apps > ABHISHEK > Permissions me allow karo.");
        }
    }

    private void doSave(PluginCall call) {
        String name = call.getString("name", "abhishek_file");
        String data = call.getString("data", "");
        String mime = call.getString("mime", "");
        try {
            if (name == null) name = "abhishek_file";
            name = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            if (name.isEmpty()) name = "abhishek_file";

            if (mime == null || mime.isEmpty()) {
                int dot = name.lastIndexOf('.');
                String ext = dot > 0 ? name.substring(dot + 1).toLowerCase() : "";
                String guess = ext.isEmpty() ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                mime = guess != null ? guess : "application/octet-stream";
            }

            byte[] bytes = Base64.decode(data == null ? "" : data, Base64.DEFAULT);
            String savedName = name;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ABHISHEK");
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new Exception("File bana nahi payi");
                OutputStream os = resolver.openOutputStream(uri);
                if (os == null) throw new Exception("File khul nahi payi");
                try {
                    os.write(bytes);
                    os.flush();
                } finally {
                    os.close();
                }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "ABHISHEK");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Folder nahi bana");
                String base = name;
                String ext2 = "";
                int d = name.lastIndexOf('.');
                if (d > 0) {
                    base = name.substring(0, d);
                    ext2 = name.substring(d);
                }
                File out = new File(dir, name);
                int n = 1;
                while (out.exists()) {
                    out = new File(dir, base + " (" + n + ")" + ext2);
                    n++;
                }
                FileOutputStream fos = new FileOutputStream(out);
                try {
                    fos.write(bytes);
                    fos.flush();
                } finally {
                    fos.close();
                }
                savedName = out.getName();
                MediaScannerConnection.scanFile(getContext(), new String[] { out.getAbsolutePath() }, null, null);
            }

            JSObject ret = new JSObject();
            ret.put("name", savedName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Save fail: " + e.getMessage());
        }
    }
}
