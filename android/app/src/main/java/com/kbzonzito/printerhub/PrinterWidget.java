package com.kbzonzito.printerhub;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.view.View;
import android.widget.RemoteViews;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Date;

/**
 * Home screen widget with the printer state, progress and finish time. From two rows tall it
 * switches to a layout with the print's thumbnail. Colors follow the system theme on 12+.
 */
public class PrinterWidget extends AppWidgetProvider {
    /** Minimum height (dp) at which the large layout with the thumbnail is used. */
    private static final int LARGE_MIN_HEIGHT = 110;
    private static final String THUMB_FILE = "widget_thumb.png";

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager manager, int id, Bundle options) {
        render(ctx, manager, new int[] {id});
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        render(ctx, manager, ids);
        // Refresh in the background when the monitor service isn't already doing it.
        SharedPreferences prefs = Moonraker.prefs(ctx);
        String host = prefs.getString("host", null);
        if (host == null) return;
        int port = prefs.getInt("port", 7125);
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                Moonraker.Snapshot snap = Moonraker.fetch(host, port);
                Moonraker.saveSnapshot(ctx, snap);
                refreshThumbnail(ctx, host, port, snap.filename);
            } catch (Exception e) {
                prefs.edit().putString("w_state", "offline").apply();
            }
            render(ctx, manager, ids);
            pending.finish();
        }).start();
    }

    static void updateAll(Context ctx) {
        PrinterTileService.requestUpdate(ctx);
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, PrinterWidget.class));
        if (ids.length > 0) render(ctx, manager, ids);
    }

    /**
     * Downloads the thumbnail of `filename` when it changes (call off the main thread).
     * Returns true if a new one was saved.
     */
    static boolean refreshThumbnail(Context ctx, String host, int port, String filename) {
        SharedPreferences prefs = Moonraker.prefs(ctx);
        String file = filename == null ? "" : filename;
        if (file.equals(prefs.getString("w_thumb_for", null))) return false;
        File out = new File(ctx.getFilesDir(), THUMB_FILE);
        try {
            Bitmap bmp = file.isEmpty() ? null : Moonraker.fetchThumbnail(host, port, file);
            if (bmp == null) {
                out.delete();
            } else {
                try (FileOutputStream os = new FileOutputStream(out)) {
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, os);
                }
            }
            prefs.edit().putString("w_thumb_for", file).apply();
            return true;
        } catch (Exception e) {
            return false; // try again on the next refresh
        }
    }

    /** Refreshes the thumbnail in the background if the printed file changed, then redraws. */
    static void refreshThumbnailAsync(Context ctx, String filename) {
        SharedPreferences prefs = Moonraker.prefs(ctx);
        String host = prefs.getString("host", null);
        if (host == null) return;
        String file = filename == null ? "" : filename;
        if (file.equals(prefs.getString("w_thumb_for", null))) return;
        int port = prefs.getInt("port", 7125);
        new Thread(() -> {
            if (refreshThumbnail(ctx, host, port, file)) updateAll(ctx);
        }).start();
    }

    private static void render(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            int minHeight = manager.getAppWidgetOptions(id)
                    .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            manager.updateAppWidget(id, build(ctx, minHeight >= LARGE_MIN_HEIGHT));
        }
    }

    private static RemoteViews build(Context ctx, boolean large) {
        SharedPreferences prefs = Moonraker.prefs(ctx);
        String lang = prefs.getString("lang", "es");
        String name = prefs.getString("name", "Printer Hub");
        String state = prefs.getString("w_state", null);
        String file = prefs.getString("w_file", "");
        float progress = prefs.getFloat("w_progress", 0);
        long finish = prefs.getLong("w_finish", 0);
        boolean active = "printing".equals(state) || "paused".equals(state);

        RemoteViews views = new RemoteViews(ctx.getPackageName(),
                large ? R.layout.widget_printer_large : R.layout.widget_printer);
        views.setTextViewText(R.id.widget_name, name);
        views.setOnClickPendingIntent(R.id.widget_root, PrinterMonitorService.openApp(ctx));

        if (prefs.getString("host", null) == null || state == null) {
            views.setTextViewText(R.id.widget_state, Texts.get(lang, "no_printer"));
            views.setViewVisibility(R.id.widget_progress, View.GONE);
            views.setViewVisibility(R.id.widget_detail, View.GONE);
            views.setTextViewText(R.id.widget_percent, "");
        } else {
            views.setTextViewText(R.id.widget_state, Texts.get(lang, state));
            views.setViewVisibility(R.id.widget_progress, active ? View.VISIBLE : View.GONE);
            views.setProgressBar(R.id.widget_progress, 100, Math.round(progress * 100), false);
            views.setTextViewText(R.id.widget_percent, active ? Math.round(progress * 100) + "%" : "");
            String detail = file.isEmpty() ? "" : Moonraker.baseName(file);
            if (active && finish > 0) {
                detail = String.format(Texts.get(lang, "finish_at"),
                        DateFormat.getTimeFormat(ctx).format(new Date(finish))) + " · " + detail;
            }
            views.setTextViewText(R.id.widget_detail, detail);
            views.setViewVisibility(R.id.widget_detail, detail.isEmpty() ? View.GONE : View.VISIBLE);
        }
        if (large) {
            File thumb = new File(ctx.getFilesDir(), THUMB_FILE);
            Bitmap bmp = thumb.exists() ? BitmapFactory.decodeFile(thumb.getPath()) : null;
            views.setImageViewBitmap(R.id.widget_thumb, bmp);
            views.setViewVisibility(R.id.widget_thumb, bmp != null ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.widget_thumb_placeholder, bmp != null ? View.GONE : View.VISIBLE);
        }
        return views;
    }
}
