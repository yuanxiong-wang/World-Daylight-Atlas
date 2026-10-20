# iOS binary inspection — 2026-10-20

Inspected the unsigned **device** application from atlas commit `347840c0a98eecd03623bf53165c6ea828323cc6`, using the unmodified Core parser and insight engine from [BinaryExplorer](https://github.com/Viktorianec/BinaryExplorer) revision `cfe10349910006d639684713bfff107be30a9996`. The macOS desktop UI was not launched. The audit adapter ran successfully on a macOS GitHub Actions runner.

[Inspection run and results](https://github.com/yuanxiong-wang/World-Daylight-Atlas/actions/runs/39357617113) · [JSON report, Markdown report and inspection IPA](https://github.com/yuanxiong-wang/World-Daylight-Atlas/actions/runs/39357617113/artifacts/12236580273)

The input was the unsigned device archive from [iOS build run 39276714714](https://github.com/yuanxiong-wang/World-Daylight-Atlas/actions/runs/39276714714), repackaged under `Payload/App.app` for the analyzer. This inspection IPA is not installable and is not a signed TestFlight export. Repackaging preserves the application file bytes; ZIP compression and file permissions are not distribution metadata.

## Results

BinaryExplorer returned **0 critical findings, 1 warning, 3 notices and 3 healthy findings**.

| Finding | Interpretation for this build |
| --- | --- |
| Warning: no embedded code signature | Expected: CI compiled with signing disabled. Requires Apple distribution signing before TestFlight. |
| Notice: no embedded provisioning profile | Expected for this unsigned archive. The tool's generic explanation about stripped App Store profiles does not describe this build. |
| Notice: payload is essentially incompressible | Caused by the inspection adapter's deliberately uncompressed ZIP container. It does not establish that the underlying app resources cannot compress. |
| Notice: ships the Swift runtime | The rule is triggered by references to `libswift` libraries. The reported paths use `/usr/lib/swift/`; the inspected payload does not embed Swift runtime dylibs. |
| Healthy: export compliance declared | `ITSAppUsesNonExemptEncryption` is false. |
| Healthy: not FairPlay encrypted | Expected for a pre-store build. |
| Healthy: uses chained fixups | Present in the app executable. |

Additional report observations:

- Identity: `cc.ccwu.mytest.atlas`, display name **Daylight Atlas**, version **1.0**, build **1**.
- Device executable: **arm64**, iOS **17.0** minimum, SDK **26.2**, position-independent executable enabled.
- Installed file bytes: **2,278,321** across **32 files** (about 2.28 MB; excludes filesystem overhead and runtime memory).
- Three Mach-O binaries: the app, Capacitor.framework and Cordova.framework. Framework dylibs do not need the executable's PIE flag.
- Three privacy manifests were found. All declare no tracking; their collected-data and accessed-API arrays are empty. This reports declarations rather than proving API-use compliance.
- No ATS overrides, sensitive-permission purpose strings, background modes or custom URL schemes were declared.
- The reported linked-library tables contain no private-framework paths. This does not inspect every runtime API call.

No application-code changes were indicated by these findings. Signing and provisioning remain outstanding for distribution. Run this inspection again against the final signed export; static parsing does not verify cryptographic signature validity, rule out embedded secrets, or guarantee Apple approval.

To repeat the audit or open the inspection IPA in the BinaryExplorer desktop app, follow [IOS.md](../IOS.md#binaryexplorer-inspection). GitHub artifacts expire; the workflow can inspect a newer successful native-build run by its run ID.
