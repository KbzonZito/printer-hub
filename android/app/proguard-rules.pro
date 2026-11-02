# R8 rules for Printer Hub (release builds have minifyEnabled and shrinkResources).
# Capacitor, its plugins and the AndroidX libraries ship their own consumer rules; the
# activity, service, widget and tile are kept through the manifest.

# Readable stack traces in crash reports, without exposing the source file names.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Methods the WebView's JavaScript calls by name (Capacitor's bridge).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Our plugin: Capacitor finds its methods by reflection (also covered by Capacitor's rules,
# kept here explicitly because a missing method only fails at run time, in the APK).
-keep class com.kbzonzito.printerhub.PrinterMonitorPlugin { *; }

# Java-WebSocket (native WebSocket transport): its optional SLF4J logging isn't bundled.
-keep class org.java_websocket.** { *; }
-dontwarn org.slf4j.**
