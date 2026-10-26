package com.kbzonzito.printerhub;

import android.content.Context;
import android.content.SharedPreferences;

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

        /** Seconds left extrapolated from file progress, or -1 when unknown. */
        double remaining() {
            return progress > 0.01 ? printDuration / progress - printDuration : -1;
        }

        boolean active() {
            return state.equals("printing") || state.equals("paused");
        }
    }

    private Moonraker() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static Snapshot fetch(String host, int port) throws Exception {
        URL url = new URL("http://" + host + ":" + port
                + "/printer/objects/query?webhooks&print_stats&virtual_sdcard");
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
            }
            if (sd != null) s.progress = sd.optDouble("progress", 0);
            return s;
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
