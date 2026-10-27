package com.kbzonzito.printerhub;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;

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
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Bridge for the native pieces of the app: the background print monitor, the widget,
 * the device's LAN address (for printer discovery) and G-code files shared from other apps.
 */
@CapacitorPlugin(
        name = "PrinterMonitor",
        permissions = @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}))
public class PrinterMonitorPlugin extends Plugin {
    private JSObject pendingShare;

    @Override
    public void load() {
        handleIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleIntent(intent);
    }

    /** Saves the active printer so the service and widget can reach it. */
    @PluginMethod
    public void configure(PluginCall call) {
        String host = call.getString("host");
        if (host == null) {
            Moonraker.prefs(getContext()).edit().remove("host").apply();
        } else {
            Moonraker.prefs(getContext()).edit()
                    .putString("host", host)
                    .putInt("port", call.getInt("port", 7125))
                    .putString("name", call.getString("name", "Printer Hub"))
                    .putString("lang", call.getString("lang", "es"))
                    .apply();
        }
        PrinterWidget.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void startMonitor(PluginCall call) {
        PrinterMonitorService.start(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stopMonitor(PluginCall call) {
        PrinterMonitorService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call, true);
        } else {
            requestPermissionForAlias("notifications", call, "notificationsResult");
        }
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        resolveGranted(call, getPermissionState("notifications") == PermissionState.GRANTED);
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    /** Pushes the latest status from the app to the widget. */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        Moonraker.Snapshot s = new Moonraker.Snapshot();
        s.state = call.getString("state", "standby");
        s.klippy = call.getString("klippy", "ready");
        s.filename = call.getString("filename", "");
        s.progress = call.getDouble("progress", 0.0);
        s.printDuration = call.getDouble("printDuration", 0.0);
        Moonraker.saveSnapshot(getContext(), s);
        PrinterWidget.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getLocalIp(PluginCall call) {
        JSObject ret = new JSObject();
        ConnectivityManager cm = getContext().getSystemService(ConnectivityManager.class);
        Network network = cm != null ? cm.getActiveNetwork() : null;
        LinkProperties props = network != null ? cm.getLinkProperties(network) : null;
        if (props != null) {
            for (LinkAddress addr : props.getLinkAddresses()) {
                if (addr.getAddress() instanceof Inet4Address) {
                    ret.put("ip", addr.getAddress().getHostAddress());
                    break;
                }
            }
        }
        call.resolve(ret);
    }

    // ---- Native WebSockets (see NativeSocket.java and src/connection/nativeTransport.ts)

    private final Map<String, NativeSocket> sockets = new ConcurrentHashMap<>();

    private void emitSocket(String id, String type, JSObject extra) {
        JSObject event = extra != null ? extra : new JSObject();
        event.put("id", id);
        event.put("type", type);
        notifyListeners("socketEvent", event);
    }

    @PluginMethod
    public void socketOpen(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        if (id == null || url == null) {
            call.reject("id and url are required");
            return;
        }
        try {
            NativeSocket socket = new NativeSocket(url, new NativeSocket.Listener() {
                @Override
                public void onOpen() {
                    emitSocket(id, "open", null);
                }

                @Override
                public void onMessage(String data) {
                    JSObject e = new JSObject();
                    e.put("data", data);
                    emitSocket(id, "message", e);
                }

                @Override
                public void onClose(int code, String reason) {
                    sockets.remove(id);
                    JSObject e = new JSObject();
                    e.put("code", code);
                    e.put("reason", reason);
                    emitSocket(id, "close", e);
                }
            });
            NativeSocket old = sockets.put(id, socket);
            if (old != null) old.close();
            socket.connect();
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void socketSend(PluginCall call) {
        NativeSocket socket = sockets.get(call.getString("id", ""));
        if (socket != null) socket.send(call.getString("data", ""));
        call.resolve();
    }

    @PluginMethod
    public void socketClose(PluginCall call) {
        NativeSocket socket = sockets.remove(call.getString("id", ""));
        if (socket != null) socket.close();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (NativeSocket socket : sockets.values()) socket.close();
        sockets.clear();
        super.handleOnDestroy();
    }

    /** Opens a link in the default browser. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(call.getString("url", "")));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Shows the Android share sheet with a text. */
    @PluginMethod
    public void shareText(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        Intent chooser = Intent.createChooser(send, null);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    /** Accent color of the system theme (Material You, Android 12+), used as the palette seed. */
    @PluginMethod
    public void getSystemColor(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= 31) {
            int color = getContext().getColor(android.R.color.system_accent1_500);
            ret.put("color", String.format("#%06x", color & 0xffffff));
        }
        call.resolve(ret);
    }

    /** Returns (once) a file that was shared to the app before JS was listening. */
    @PluginMethod
    public void takeSharedFile(PluginCall call) {
        JSObject ret = pendingShare != null ? pendingShare : new JSObject();
        pendingShare = null;
        call.resolve(ret);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            uri = intent.getData();
        }
        if (uri == null) return;
        intent.setAction(null); // don't import the same file again on recreate
        Uri source = uri;
        new Thread(() -> {
            try {
                JSObject file = copyToCache(source);
                pendingShare = file;
                notifyListeners("sharedFile", file, true);
            } catch (Exception ignored) {
                // Unreadable share; nothing to import.
            }
        }).start();
    }

    private JSObject copyToCache(Uri uri) throws Exception {
        String name = "shared.gcode";
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0 && c.getString(idx) != null) name = c.getString(idx);
            }
        } catch (Exception ignored) {
            if (uri.getLastPathSegment() != null) name = uri.getLastPathSegment();
        }
        File dir = new File(getContext().getCacheDir(), "shared");
        if (!dir.exists()) dir.mkdirs();
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        File out = new File(dir, name.replaceAll("[/\\\\]", "_"));
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
        }
        JSObject ret = new JSObject();
        ret.put("name", name);
        ret.put("path", out.getAbsolutePath());
        ret.put("size", out.length());
        return ret;
    }
}
