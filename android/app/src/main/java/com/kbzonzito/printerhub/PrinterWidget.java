package com.kbzonzito.printerhub;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.text.format.DateFormat;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Date;

/** Home screen widget with the printer state, progress and finish time. */
public class PrinterWidget extends AppWidgetProvider {

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
                Moonraker.saveSnapshot(ctx, Moonraker.fetch(host, port));
            } catch (Exception e) {
                prefs.edit().putString("w_state", "offline").apply();
            }
            render(ctx, manager, ids);
            pending.finish();
        }).start();
    }

    static void updateAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, PrinterWidget.class));
        if (ids.length > 0) render(ctx, manager, ids);
    }

    private static void render(Context ctx, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = Moonraker.prefs(ctx);
        String lang = prefs.getString("lang", "es");
        String name = prefs.getString("name", "Printer Hub");
        String state = prefs.getString("w_state", null);
        String file = prefs.getString("w_file", "");
        float progress = prefs.getFloat("w_progress", 0);
        long finish = prefs.getLong("w_finish", 0);
        boolean active = "printing".equals(state) || "paused".equals(state);

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_printer);
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
        manager.updateAppWidget(ids, views);
    }
}
