package com.kbzonzito.printerhub;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONArray;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Minimal Moonraker client shared by the monitor service and the home screen widget. */
final class Moonraker {
    static final String PREFS = "printer_hub";

    static final class Snapshot {
        String state = "standby";
        String klippy = "ready";
        String message = "";
        String filename = "";
        double progress;
        double printDuration;
        /** Layer reported by the slicer (SET_PRINT_STATS_INFO), or -1 if unknown. */
        int currentLayer = -1;
        double extruderTemp = -1;

        /** Seconds left extrapolated from file progress, or -1 when unknown. */
        double remaining() {
            return progress > 0.01 ? printDuration / progress - printDuration : -1;
        }

        boolean active() {
            return state.equals("printing") || state.equals("paused");
        }
    }

    private Moonraker() {}

    private static byte[] read(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(8000);
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } finally {
            conn.disconnect();
        }
    }

    private static String encodePath(String path) throws Exception {
        StringBuilder out = new StringBuilder();
        for (String part : path.split("/")) {
            if (out.length() > 0) out.append('/');
            out.append(java.net.URLEncoder.encode(part, "UTF-8").replace("+", "%20"));
        }
        return out.toString();
    }

    /** The largest thumbnail the slicer embedded in a G-code file, or null. */
    static Bitmap fetchThumbnail(String host, int port, String filename) throws Exception {
        String base = "http://" + host + ":" + port;
        JSONObject meta = new JSONObject(new String(read(base + "/server/files/metadata?filename="
                + java.net.URLEncoder.encode(filename, "UTF-8")), "UTF-8")).getJSONObject("result");
        JSONArray thumbs = meta.optJSONArray("thumbnails");
        if (thumbs == null || thumbs.length() == 0) return null;
        JSONObject best = thumbs.getJSONObject(0);
        for (int i = 1; i < thumbs.length(); i++) {
            JSONObject t = thumbs.getJSONObject(i);
            if (t.optInt("width") > best.optInt("width")) best = t;
        }
        String dir = filename.contains("/") ? filename.substring(0, filename.lastIndexOf('/') + 1) : "";
        byte[] png = read(base + "/server/files/gcodes/" + encodePath(dir + best.getString("relative_path")));
        // Widgets have a small memory budget for bitmaps.
        return scaled(BitmapFactory.decodeByteArray(png, 0, png.length), 300);
    }

    /** A still image from a URL (camera snapshot), or null if it isn't an image. */
    static Bitmap fetchImage(String url, int max) {
        try {
            byte[] data = read(url);
            return scaled(BitmapFactory.decodeByteArray(data, 0, data.length), max);
        } catch (Exception e) {
            return null;
        }
    }

    private static Bitmap scaled(Bitmap bmp, int max) {
        if (bmp == null) return null;
        if (bmp.getWidth() <= max && bmp.getHeight() <= max) return bmp;
        float k = (float) max / Math.max(bmp.getWidth(), bmp.getHeight());
        return Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * k),
                Math.round(bmp.getHeight() * k), true);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Snapshot fetch(String host, int port) throws Exception {
        URL url = new URL("http://" + host + ":" + port
                + "/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder=temperature");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject status = new JSONObject(out.toString("UTF-8"))
                    .getJSONObject("result").getJSONObject("status");
            Snapshot s = new Snapshot();
            JSONObject webhooks = status.optJSONObject("webhooks");
            JSONObject stats = status.optJSONObject("print_stats");
            JSONObject sd = status.optJSONObject("virtual_sdcard");
            if (webhooks != null) s.klippy = webhooks.optString("state", "ready");
            if (stats != null) {
                s.state = stats.optString("state", "standby");
                s.message = stats.optString("message", "");
                s.filename = stats.optString("filename", "");
                s.printDuration = stats.optDouble("print_duration", 0);
                JSONObject info = stats.optJSONObject("info");
                if (info != null && !info.isNull("current_layer")) {
                    s.currentLayer = info.optInt("current_layer", -1);
                }
            }
            if (sd != null) s.progress = sd.optDouble("progress", 0);
            JSONObject extruder = status.optJSONObject("extruder");
            if (extruder != null) s.extruderTemp = extruder.optDouble("temperature", -1);
            return s;
        } finally {
            conn.disconnect();
        }
    }

    /** Switches a Moonraker power device (smart plug) off. */
    static void powerOff(String host, int port, String device) throws Exception {
        URL url = new URL("http://" + host + ":" + port + "/machine/device_power/device?device="
                + java.net.URLEncoder.encode(device, "UTF-8") + "&action=off");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(10000);
        try {
            int code = conn.getResponseCode();
            if (code >= 300) throw new Exception("HTTP " + code);
        } finally {
            conn.disconnect();
        }
    }

    /** Stores the latest snapshot for the widget. */
    static void saveSnapshot(Context ctx, Snapshot s) {
        double remaining = s.remaining();
        prefs(ctx).edit()
                .putString("w_state", s.klippy.equals("ready") ? s.state : "error")
                .putString("w_file", s.filename)
                .putFloat("w_progress", (float) s.progress)
                .putLong("w_finish", s.state.equals("printing") && remaining >= 0
                        ? System.currentTimeMillis() + (long) (remaining * 1000) : 0)
                .putLong("w_updated", System.currentTimeMillis())
                .apply();
    }

    static String baseName(String path) {
        String name = path.substring(path.lastIndexOf('/') + 1);
        return name.replaceAll("(?i)\\.(gcode|g|gco)$", "");
    }
}
