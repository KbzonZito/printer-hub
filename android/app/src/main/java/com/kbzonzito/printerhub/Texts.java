package com.kbzonzito.printerhub;

import java.util.HashMap;
import java.util.Map;

/** Notification and widget strings; the language is chosen in the web app's settings. */
final class Texts {
    private static final Map<String, String[]> STRINGS = new HashMap<>();

    static {
        // key -> { es, en }
        put("channel_progress", "Progreso de impresión", "Print progress");
        put("channel_alerts", "Avisos de la impresora", "Printer alerts");
        put("connecting", "Conectando…", "Connecting…");
        put("printing", "Imprimiendo", "Printing");
        put("paused", "En pausa", "Paused");
        put("standby", "En espera", "Standby");
        put("complete", "Completado", "Complete");
        put("cancelled", "Cancelado", "Cancelled");
        put("error", "Error", "Error");
        put("finish_at", "fin %s", "done at %s");
        put("done_title", "Impresión completada", "Print complete");
        put("paused_title", "Impresión en pausa", "Print paused");
        put("paused_text", "Revisa la impresora (¿filamento?).", "Check the printer (filament?).");
        put("cancelled_title", "Impresión cancelada", "Print cancelled");
        put("error_title", "Error en la impresora", "Printer error");
        put("lost_title", "Sin conexión con la impresora", "Lost connection to the printer");
        put("lost_text", "No responde desde hace 2 minutos.", "Not responding for 2 minutes.");
        put("no_printer", "Abre la app para configurar", "Open the app to set up");
        put("offline", "Sin conexión", "Offline");
        put("cooling", "Enfriando para apagar (%d °C)", "Cooling down to power off (%d °C)");
        put("powered_off_title", "Impresora apagada", "Printer powered off");
        put("powered_off_text", "%s se apagó al terminar y enfriarse.", "%s was switched off after the print cooled down.");
        put("first_layer_title", "Primera capa terminada", "First layer done");
        put("first_layer_text", "%s · revisa que se haya pegado bien a la cama.",
                "%s · check that it stuck well to the bed.");
    }

    private static void put(String key, String es, String en) {
        STRINGS.put(key, new String[] {es, en});
    }

    static String get(String lang, String key) {
        String[] v = STRINGS.get(key);
        if (v == null) return key;
        return "en".equals(lang) ? v[1] : v[0];
    }

    private Texts() {}
}
