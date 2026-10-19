# World Daylight Atlas for iOS

The iOS app packages the atlas inside a Capacitor 8 native application. It does not load the live GitHub Pages website. The globe, 45 built-in cities, solar/lunar calculations, photography windows, comparisons, calendar and ground-level sky work without a network connection. Worldwide city search needs Open-Meteo; its results never expand the built-in list.

iPhone and iPad use the compact, single-sheet controls at every size. Native backgrounding pauses GPU rendering and time playback; reduced-motion preferences remain respected. The native share sheet and clipboard share public `https://mytest.ccwu.cc/` links, so recipients can open the web version. The app uses system fonts; no Google Fonts connection is needed. Web links currently open the website, not the installed app.

## Build and run

Requires macOS, **Xcode 26 or newer**, Node.js 22 or newer (CI uses 24), and an iOS 15+ simulator/device.

```sh
npm install --no-package-lock
npm run ios:sync
npm run ios:open
```

In Xcode, select the **App** scheme and an iPhone or iPad simulator, then Run. `ios:sync` builds `dist-ios`, copies the assets and plugins into `ios/App/App/public`, pins the native Capacitor runtime, and generates the 1024px icon. Run it after every web change. Generated assets are ignored by Git; a fresh checkout must sync before opening/building. There is no development server URL in the release configuration.

The provisional bundle identifier is `cc.ccwu.mytest.atlas` and the home screen name is **Daylight Atlas**. Change the ID in both `capacitor.config.ts` and the Xcode target if it is unavailable in your developer account. Keep secrets, signing certificates, provisioning profiles and `.p8` files out of the repository.

## Automated checks

The **iOS simulator and archive** GitHub Actions workflow checks types and numerical regressions, tests the bundled interface at iPhone and iPad widths while blocking outside requests, compiles an unsigned simulator app, boots it on iPhone and iPad simulators, captures screenshots/logs, and builds an unsigned device archive. Download the **daylight-atlas-ios** artifact from a successful run to inspect the simulator application and screenshots. The simulator ZIP cannot be installed on a real iPhone. Launch screenshots are smoke checks, not a substitute for device testing or accessibility review.

```sh
npm run build:ios
npx playwright install chromium
npx playwright test --config playwright.ios.config.ts
```

The existing Pages workflow and browser tests remain separate. Both builds use the same React application and astronomical calculations.

## TestFlight first

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/). A paid, active membership is required for TestFlight and App Store distribution. A free personal team can run limited development builds from Xcode on your own device.
2. Open the synced project, add your Apple account in Xcode Settings → Accounts, then choose your team under App → Signing & Capabilities. Keep automatic signing enabled. Confirm the bundle identifier is registered to your team.
3. Create an iOS app in [App Store Connect](https://appstoreconnect.apple.com/) with that identifier. Choose the final public app name and complete agreements and account information.
4. Set the version/build number in the Xcode target (increment the build for each upload). Select **Any iOS Device**, then Product → Archive → Distribute App → App Store Connect → Upload. CI builds unsigned archives only; it does not publish or upload credentials.
5. Once processing finishes, complete export compliance and TestFlight information. Add internal testers first. External testers require Beta App Review. Test on physical iPhones and iPads, offline and online, in portrait/landscape, with larger text, VoiceOver, reduced motion, and background/resume.

## App Store afterward

Before submitting, prepare device screenshots, description, age rating, support URL, a public privacy policy and accurate App Privacy answers. The app requests no GPS, camera, microphone or photo-library access, and has no account, advertising or analytics integration. The native privacy manifest declares no first-party collection or tracking; plugin manifests are included by Swift Package Manager. Worldwide searches send the entered query to Open-Meteo over HTTPS; review its current privacy practices when completing the store disclosures. Shared links contain the selected city coordinates.

The encryption declaration covers standard platform HTTPS only; revisit it if encryption features change. The app has not been submitted to Apple, and App Review acceptance is not guaranteed. Universal links, push notifications, purchases and background location are not configured. Apple signing and App Store Connect setup are intentionally left to the developer account owner.
