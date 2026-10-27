package com.kbzonzito.printerhub;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Above this the fixed-size controls (nav bar, stats) start to overflow. */
    private static final float MAX_FONT_SCALE = 1.3f;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterMonitorPlugin.class);
        super.onCreate(savedInstanceState);
        // Follow the system font size (Settings → Display → Font size).
        float scale = Math.min(getResources().getConfiguration().fontScale, MAX_FONT_SCALE);
        getBridge().getWebView().getSettings().setTextZoom(Math.round(scale * 100));
    }
}
