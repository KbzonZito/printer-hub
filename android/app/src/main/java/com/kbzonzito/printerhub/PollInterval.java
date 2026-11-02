package com.kbzonzito.printerhub;

/**
 * How often the monitor service asks the printer, to save battery on long prints: every
 * minute while there's more than an hour left, more often near the end and whenever
 * something can happen soon (a pause, the first layer, the plug switching off).
 */
final class PollInterval {
    static final long FAST = 15;
    static final long MEDIUM = 30;
    static final long SLOW = 60;

    private PollInterval() {}

    /**
     * @param watchingFirstLayer the first-layer alert is on and hasn't fired for this print
     * @param cooling waiting for the nozzle to cool before switching the plug off
     */
    static long seconds(Moonraker.Snapshot s, boolean watchingFirstLayer, boolean cooling) {
        if (cooling) return MEDIUM;
        if (!s.state.equals("printing") || !s.klippy.equals("ready")) return FAST;
        if (watchingFirstLayer) return FAST;
        double remaining = s.remaining();
        if (remaining < 0) return FAST; // not enough progress yet to tell
        if (remaining > 3600) return SLOW;
        if (remaining > 900) return MEDIUM;
        return FAST;
    }
}
