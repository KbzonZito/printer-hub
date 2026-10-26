import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kbzonzito.printerhub',
  appName: 'Printer Hub',
  webDir: 'dist',
  server: {
    // The printer speaks plain HTTP on the LAN, so the WebView must not be https.
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Route fetch() through native HTTP so Moonraker's CORS rules don't apply.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
