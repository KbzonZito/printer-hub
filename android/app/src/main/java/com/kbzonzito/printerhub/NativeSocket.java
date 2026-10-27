package com.kbzonzito.printerhub;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;

/**
 * A WebSocket opened from Java instead of the WebView. The WebView sends
 * "Origin: http://localhost", which Moonraker rejects unless cors_domains allows it (the
 * Creality Hi doesn't); a native connection sends no Origin, like Mobileraker.
 */
class NativeSocket {
    interface Listener {
        void onOpen();
        void onMessage(String data);
        void onClose(int code, String reason);
    }

    private final WebSocketClient client;
    private volatile boolean closedByApp = false;

    NativeSocket(String url, Listener listener) throws Exception {
        client = new WebSocketClient(new URI(url)) {
            @Override
            public void onOpen(ServerHandshake handshake) {
                if (!closedByApp) listener.onOpen();
            }

            @Override
            public void onMessage(String message) {
                if (!closedByApp) listener.onMessage(message);
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                if (!closedByApp) listener.onClose(code, reason == null ? "" : reason);
            }

            @Override
            public void onError(Exception ex) {
                // Followed by onClose, which reports it.
            }
        };
        // WebSocket pings detect dead connections even when Moonraker has nothing to send.
        client.setConnectionLostTimeout(20);
        client.setTcpNoDelay(true);
    }

    void connect() {
        client.connect();
    }

    void send(String data) {
        if (client.isOpen()) client.send(data);
    }

    /** Closes without notifying the listener, as the app asked for it. */
    void close() {
        closedByApp = true;
        client.close();
    }
}
