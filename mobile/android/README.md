# IIMM Android

Native Kotlin/Jetpack Compose application. It uses the production IIMM API and the Mappls Android SDK 9.x.

1. Register `com.mappls.dic.iimm` and the debug/release SHA-256 values in the Mappls Auth Console.
2. Copy the downloaded `*.a.conf` and `*.a.olf` files into `app/`.
3. Run `./gradlew :app:assembleDebug` or install with `./gradlew :app:installDebug`.

Current local debug signing SHA-256:

`0F:2B:E5:D5:DB:3F:B3:C6:18:88:B1:16:B4:6E:3D:A3:41:53:59:B1:17:D6:FC:7E:EE:2F:52:04:66:5C:D1:F4`

Register the release keystore SHA-256 separately before producing a signed release build.

Without both Mappls files the application still builds, clearly identifies the missing native credentials, and does not substitute another map provider.
