package com.kbzonzito.printerhub;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterMonitorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
