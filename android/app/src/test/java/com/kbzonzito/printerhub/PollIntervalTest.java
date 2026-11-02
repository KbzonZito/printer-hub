package com.kbzonzito.printerhub;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class PollIntervalTest {
    /** A print `elapsed` seconds in at `progress` (0–1): remaining = elapsed / progress - elapsed. */
    private static Moonraker.Snapshot printing(double elapsed, double progress) {
        Moonraker.Snapshot s = new Moonraker.Snapshot();
        s.state = "printing";
        s.printDuration = elapsed;
        s.progress = progress;
        return s;
    }

    @Test
    public void slowsDownWhenThereIsLongLeft() {
        assertEquals(PollInterval.SLOW, PollInterval.seconds(printing(3600, 0.25), false, false)); // 3 h left
        assertEquals(PollInterval.MEDIUM, PollInterval.seconds(printing(3600, 0.75), false, false)); // 20 min
        assertEquals(PollInterval.FAST, PollInterval.seconds(printing(3600, 0.9), false, false)); // 6.7 min
    }

    @Test
    public void staysFastWhenSomethingCanHappenSoon() {
        assertEquals(PollInterval.FAST, PollInterval.seconds(printing(3600, 0.25), true, false)); // first layer
        assertEquals(PollInterval.FAST, PollInterval.seconds(printing(60, 0.005), false, false)); // unknown
        Moonraker.Snapshot paused = printing(3600, 0.25);
        paused.state = "paused";
        assertEquals(PollInterval.FAST, PollInterval.seconds(paused, false, false));
        Moonraker.Snapshot error = printing(3600, 0.25);
        error.klippy = "shutdown";
        assertEquals(PollInterval.FAST, PollInterval.seconds(error, false, false));
    }

    @Test
    public void checksTheTemperatureCalmlyWhileCooling() {
        Moonraker.Snapshot done = printing(3600, 1);
        done.state = "complete";
        assertEquals(PollInterval.MEDIUM, PollInterval.seconds(done, false, true));
    }
}
