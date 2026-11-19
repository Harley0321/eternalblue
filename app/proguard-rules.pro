-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn kotlinx.serialization.**
-keepclassmembers class com.example.model.** { *; }
-keepclassmembers class * {
    @kotlinx.serialization.Serializable *;
}
-keep class com.example.model.** { *; }
-keep class com.example.BuildConfig { *; }
-keep class com.example.hardware.UpdateResultReceiver { *; }
-keep class com.example.hardware.PackageReplacedReceiver { *; }
-dontwarn com.google.mlkit.**
-dontwarn androidx.camera.**
-dontwarn com.google.zxing.**
