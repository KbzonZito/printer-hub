package com.kbzonzito.printerhub;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.text.format.DateFormat;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import java.util.Date;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Foreground service that polls Moonraker while a print is running, so progress and
 * alerts (finished, paused, error, lost connection) arrive with the app closed.
 * It stops itself once the printer is no longer printing.
 */
public class PrinterMonitorService extends Service {
    static final String CHANNEL_PROGRESS = "progress";
    static final String CHANNEL_ALERTS = "alerts";
    private static final int ONGOING_ID = 1;
    private static final int ALERT_ID = 2;
    private static final long POLL_SECONDS = 15;
    private static final long LOST_AFTER_MS = 2 * 60 * 1000;

    private ScheduledExecutorService executor;
    private PowerManager.WakeLock wakeLock;
    private String host;
    private int port;
    private String name;
    private String lang;
    private String lastState;
    private long lastOk;
    private boolean lostNotified;

    static void start(Context ctx) {
        Intent intent = new Intent(ctx, PrinterMonitorService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent);
        else ctx.startService(intent);
    }

    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, PrinterMonitorService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = Moonraker.prefs(this);
        host = prefs.getString("host", null);
        port = prefs.getInt("port", 7125);
        name = prefs.getString("name", "Printer Hub");
        lang = prefs.getString("lang", "es");
        createChannels(this, lang);

        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, ONGOING_ID,
                ongoing(Texts.get(lang, "connecting"), null, -1), type);

        if (host == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (executor == null) {
            lastOk = System.currentTimeMillis();
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PrinterHub:monitor");
            wakeLock.acquire(24 * 60 * 60 * 1000L);
            executor = Executors.newSingleThreadScheduledExecutor();
            executor.scheduleWithFixedDelay(this::poll, 0, POLL_SECONDS, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    private void poll() {
        try {
            Moonraker.Snapshot s = Moonraker.fetch(host, port);
            lastOk = System.currentTimeMillis();
            lostNotified = false;
            Moonraker.saveSnapshot(this, s);
            PrinterWidget.updateAll(this);
            handleTransition(s);
            if (s.active() && s.klippy.equals("ready")) {
                notify(ONGOING_ID, ongoingFor(s));
            } else {
                shutdown();
            }
        } catch (Exception e) {
            if (!lostNotified && System.currentTimeMillis() - lastOk > LOST_AFTER_MS) {
                lostNotified = true;
                alert(Texts.get(lang, "lost_title"), Texts.get(lang, "lost_text"));
                notify(ONGOING_ID, ongoing(Texts.get(lang, "offline"), null, -1));
            }
        }
    }

    private void handleTransition(Moonraker.Snapshot s) {
        String state = s.klippy.equals("ready") ? s.state : "error";
        String prev = lastState;
        lastState = state;
        if (prev == null || prev.equals(state)) return;
        String file = Moonraker.baseName(s.filename);
        switch (state) {
            case "complete":
                alert(Texts.get(lang, "done_title"), file);
                break;
            case "paused":
                alert(Texts.get(lang, "paused_title"),
                        s.message.isEmpty() ? Texts.get(lang, "paused_text") : s.message);
                break;
            case "cancelled":
                alert(Texts.get(lang, "cancelled_title"), file);
                break;
            case "error":
                alert(Texts.get(lang, "error_title"), s.message.isEmpty() ? file : s.message);
                break;
            default:
                break;
        }
    }

    private Notification ongoingFor(Moonraker.Snapshot s) {
        int pct = (int) Math.round(s.progress * 100);
        String text = Texts.get(lang, s.state);
        double remaining = s.remaining();
        if (s.state.equals("printing") && remaining >= 0) {
            Date finish = new Date(System.currentTimeMillis() + (long) (remaining * 1000));
            text += " · " + String.format(Texts.get(lang, "finish_at"),
                    DateFormat.getTimeFormat(this).format(finish));
        }
        return ongoing(name + " · " + pct + "%", text + "\n" + Moonraker.baseName(s.filename), pct);
    }

    private Notification ongoing(String title, String text, int progress) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_PROGRESS)
                .setSmallIcon(R.drawable.ic_stat_printer)
                .setContentTitle(title)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setContentIntent(openApp(this))
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (text != null) {
            b.setContentText(text.split("\n")[0]);
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(text));
        }
        if (progress >= 0) b.setProgress(100, progress, false);
        else b.setProgress(0, 0, true);
        return b.build();
    }

    private void alert(String title, String text) {
        notify(ALERT_ID, new NotificationCompat.Builder(this, CHANNEL_ALERTS)
                .setSmallIcon(R.drawable.ic_stat_printer)
                .setContentTitle(title)
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(openApp(this))
                .build());
    }

    private void notify(int id, Notification n) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        try {
            nm.notify(id, n);
        } catch (SecurityException ignored) {
            // Notification permission was revoked.
        }
    }

    private void shutdown() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    static PendingIntent openApp(Context ctx) {
        Intent intent = new Intent(ctx, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void createChannels(Context ctx, String lang) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_PROGRESS,
                Texts.get(lang, "channel_progress"), NotificationManager.IMPORTANCE_LOW));
        nm.createNotificationChannel(new NotificationChannel(CHANNEL_ALERTS,
                Texts.get(lang, "channel_alerts"), NotificationManager.IMPORTANCE_HIGH));
    }

    @Override
    public void onDestroy() {
        if (executor != null) executor.shutdownNow();
        executor = null;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
