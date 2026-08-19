# IIMM Android

Native Kotlin/Jetpack Compose application. It uses the production IIMM API and the Mappls Android SDK 9.x.

1. Register `com.mappls.dic.iimm` and the debug/release SHA-256 values in the Mappls Auth Console.
2. Copy the downloaded `*.a.conf` and `*.a.olf` files into `app/`.
3. Run `./gradlew :app:assembleDebug` or install with `./gradlew :app:installDebug`.

Without both Mappls files the application still builds, clearly identifies the missing native credentials, and does not substitute another map provider.
