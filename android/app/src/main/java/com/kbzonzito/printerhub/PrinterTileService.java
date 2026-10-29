package com.kbzonzito.printerhub;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/**
 * Quick Settings tile: the printer's state and progress in the notification shade. It reads
 * the snapshot the monitor service and widget keep, refreshes it while the shade is open,
 * and opens the app when tapped.
 */
public class PrinterTileService extends TileService {

    /** Asks the system to redraw the tile (after the monitor or widget saved new data). */
    static void requestUpdate(Context ctx) {
        try {
            TileService.requestListeningState(ctx, new ComponentName(ctx, PrinterTileService.class));
        } catch (Exception ignored) {
            // The tile isn't added, or the system refused; nothing to update.
        }
    }

    @Override
    public void onStartListening() {
        render();
        SharedPreferences prefs = Moonraker.prefs(this);
        String host = prefs.getString("host", null);
        if (host == null) return;
        int port = prefs.getInt("port", 7125);
        new Thread(() -> {
            try {
                Moonraker.saveSnapshot(this, Moonraker.fetch(host, port));
            } catch (Exception e) {
                prefs.edit().putString("w_state", "offline").apply();
            }
            render();
        }).start();
    }

    private void render() {
        Tile tile = getQsTile();
        if (tile == null) return;
        SharedPreferences prefs = Moonraker.prefs(this);
        String lang = prefs.getString("lang", "es");
        String state = prefs.getString("w_state", null);
        boolean active = "printing".equals(state) || "paused".equals(state);
        tile.setLabel(prefs.getString("name", "Printer Hub"));
        String subtitle;
        if (prefs.getString("host", null) == null || state == null) {
            subtitle = Texts.get(lang, "no_printer");
        } else if (active) {
            subtitle = Texts.get(lang, state) + " · "
                    + Math.round(prefs.getFloat("w_progress", 0) * 100) + "%";
        } else {
            subtitle = Texts.get(lang, state);
        }
        if (Build.VERSION.SDK_INT >= 29) tile.setSubtitle(subtitle);
        else tile.setLabel(subtitle);
        tile.setContentDescription(tile.getLabel() + ", " + subtitle);
        tile.setState(active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.updateTile();
    }

    @Override
    public void onClick() {
        PendingIntent open = PrinterMonitorService.openApp(this);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(open);
        } else {
            Intent intent = new Intent(this, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivityAndCollapse(intent);
        }
    }
}
