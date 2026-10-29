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
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.text.format.DateFormat;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import java.util.Collections;
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
    private static final int FIRST_LAYER_ID = 3;
    /** The plug is switched off once the nozzle is below this. */
    private static final double COOL_TEMP = 50;
    private static final long COOL_TIMEOUT_MS = 2 * 60 * 60 * 1000;
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
    private boolean firstLayerAlert;
    /** The current print was seen on its first layer, so finishing it is worth a notice. */
    private boolean sawFirstLayer;
    private boolean firstLayerNotified;
    private String jobFile;
    /** Power device to switch off after the print, and since when we are waiting to. */
    private String powerOffDevice;
    /** Camera still-frame URLs for photos in the alerts (may be empty). */
    private String[] snapshots = new String[0];
    private long powerOffSince;

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
        firstLayerAlert = prefs.getBoolean("first_layer", false);
        powerOffDevice = prefs.getString("power_off", "");
        String shots = prefs.getString("snapshots", "");
        snapshots = shots.isEmpty() ? new String[0] : shots.split(",");
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
            PrinterWidget.refreshThumbnail(this, host, port, s.filename);
            PrinterWidget.updateAll(this);
            handleTransition(s);
            checkFirstLayer(s);
            if (s.active() && s.klippy.equals("ready")) {
                powerOffSince = 0;
                notify(ONGOING_ID, ongoingFor(s));
            } else if (powerOffSince > 0) {
                waitToPowerOff(s);
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
                alertWithPhoto(Texts.get(lang, "done_title"), file, s.filename);
                if (!powerOffDevice.isEmpty()) powerOffSince = System.currentTimeMillis();
                break;
            case "paused":
                alertWithPhoto(Texts.get(lang, "paused_title"),
                        s.message.isEmpty() ? Texts.get(lang, "paused_text") : s.message, s.filename);
                break;
            case "cancelled":
                alertWithPhoto(Texts.get(lang, "cancelled_title"), file, s.filename);
                break;
            case "error":
                alertWithPhoto(Texts.get(lang, "error_title"),
                        s.message.isEmpty() ? file : s.message, s.filename);
                break;
            default:
                break;
        }
    }

    /**
     * A photo for an alert: a camera still frame, so you can see how the print looks, or the
     * file's thumbnail when the camera has none (the Creality WebRTC camera, for example).
     */
    private Bitmap photo(String filename) {
        for (String url : snapshots) {
            Bitmap bmp = Moonraker.fetchImage(url.trim(), 1024);
            if (bmp != null) return bmp;
        }
        try {
            return filename.isEmpty() ? null : Moonraker.fetchThumbnail(host, port, filename);
        } catch (Exception e) {
            return null;
        }
    }

    private void alertWithPhoto(String title, String text, String filename) {
        Bitmap bmp = photo(filename);
        NotificationCompat.Builder b = alertBuilder(title, text);
        if (bmp != null) {
            b.setLargeIcon(bmp);
            b.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(bmp)
                    .bigLargeIcon((Bitmap) null)
                    .setSummaryText(text));
        }
        notify(ALERT_ID, b.build());
    }

    /** After a finished print: switch the plug off once the nozzle has cooled down. */
    private void waitToPowerOff(Moonraker.Snapshot s) {
        if (System.currentTimeMillis() - powerOffSince > COOL_TIMEOUT_MS) {
            powerOffSince = 0;
            shutdown();
            return;
        }
        if (s.extruderTemp >= 0 && s.extruderTemp < COOL_TEMP) {
            try {
                Moonraker.powerOff(host, port, powerOffDevice);
                alert(Texts.get(lang, "powered_off_title"),
                        String.format(Texts.get(lang, "powered_off_text"), name));
            } catch (Exception ignored) {
                // Plug unreachable; leave the printer on.
            }
            powerOffSince = 0;
            shutdown();
            return;
        }
        notify(ONGOING_ID, ongoing(name, String.format(Texts.get(lang, "cooling"),
                Math.round(s.extruderTemp)), -1));
    }

    private void checkFirstLayer(Moonraker.Snapshot s) {
        if (!s.active() || !s.filename.equals(jobFile)) {
            // A new print (or none): start watching from scratch.
            jobFile = s.active() ? s.filename : null;
            sawFirstLayer = false;
            firstLayerNotified = false;
        }
        if (!firstLayerAlert || !s.state.equals("printing") || s.currentLayer < 0) return;
        if (s.currentLayer <= 1) {
            sawFirstLayer = true;
        } else if (sawFirstLayer && !firstLayerNotified) {
            firstLayerNotified = true;
            alert(FIRST_LAYER_ID, Texts.get(lang, "first_layer_title"),
                    String.format(Texts.get(lang, "first_layer_text"), Moonraker.baseName(s.filename)));
        }
    }

    private Notification ongoingFor(Moonraker.Snapshot s) {
        int pct = (int) Math.round(s.progress * 100);
        String text = Texts.get(lang, s.state);
        double remaining = s.remaining();
        long finish = 0;
        if (s.state.equals("printing") && remaining >= 0) {
            finish = System.currentTimeMillis() + (long) (remaining * 1000);
            text += " · " + String.format(Texts.get(lang, "finish_at"),
                    DateFormat.getTimeFormat(this).format(new Date(finish)));
        }
        String title = name + " · " + pct + "%";
        String body = text + "\n" + Moonraker.baseName(s.filename);
        if (Build.VERSION.SDK_INT >= 36) return liveUpdate(title, body, pct, finish);
        return ongoing(title, body, pct);
    }

    /**
     * Android 16 "Live Update": progress bar styled with the print icon, the percentage as a
     * chip in the status bar and a countdown to the finish time. Promotion needs Android 16
     * QPR2+; elsewhere it shows as a normal ongoing notification with the same style.
     */
    private Notification liveUpdate(String title, String body, int pct, long finish) {
        int color = getColor(android.R.color.system_accent1_500);
        Notification.ProgressStyle style = new Notification.ProgressStyle()
                .setStyledByProgress(true)
                .setProgress(pct)
                .setProgressTrackerIcon(Icon.createWithResource(this, R.drawable.ic_stat_printer))
                .setProgressSegments(Collections.singletonList(
                        new Notification.ProgressStyle.Segment(100).setColor(color)));
        Bundle extras = new Bundle();
        // Notification.EXTRA_REQUEST_PROMOTED_ONGOING (public from API 36.1).
        extras.putBoolean("android.requestPromotedOngoing", true);
        Notification.Builder b = new Notification.Builder(this, CHANNEL_PROGRESS)
                .setSmallIcon(R.drawable.ic_stat_printer)
                .setContentTitle(title)
                .setContentText(body.split("\n")[0])
                .setSubText(body.contains("\n") ? body.substring(body.indexOf('\n') + 1) : null)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp(this))
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
                .setShortCriticalText(pct + "%")
                .setStyle(style)
                .addExtras(extras);
        if (finish > 0) {
            b.setWhen(finish).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        }
        return b.build();
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
        alert(ALERT_ID, title, text);
    }

    private void alert(int id, String title, String text) {
        notify(id, alertBuilder(title, text).build());
    }

    private NotificationCompat.Builder alertBuilder(String title, String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ALERTS)
                .setSmallIcon(R.drawable.ic_stat_printer)
                .setContentTitle(title)
                .setContentText(text)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(openApp(this));
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
