# iOS smoke timeout investigation (2026-10-25)

Compared [October 19 success](https://github.com/yuanxiong-wang/World-Daylight-Atlas/actions/runs/39276714714) and [October 20 failure](https://github.com/yuanxiong-wang/World-Daylight-Atlas/actions/runs/39357935700).

Both used macOS 15.7.9, runner image `macos-15-arm64` version `20260907.0337.1`, Xcode 26.3, iOS 18.5, iPhone 16 Pro and iPad mini (A17 Pro). The smoke script, workflow and application sources did not change between the successful run's commit (347840c) and the failed run's commit (dd5e738). Dependency installation is not locked, so matching source does not establish identical build inputs.

| Observation | October 19 | October 20 |
| --- | ---: | ---: |
| iPhone bootstatus | 48.8 s | 70.7 s |
| iPhone screenshot | 19.4 s | 95.4 s |
| iPad bootstatus | 38.5 s | 64.1 s |
| iPad launch | 8.4 s, PID returned | 240 s timeout, no PID reported |
| Total native smoke | 5 min 30 s | 9 min 55 s, failed |

Both runs passed type/numerical checks, offline browser layouts, simulator compilation and unsigned device archiving. The failed run successfully launched and terminated the iPhone app. The iPad boot and installation completed, but launch did not return before the subprocess timeout. This is not evidence of an application crash, nor proof of an infrastructure-only problem. Earlier command delays support investigating runner/simulator responsiveness. The old logs lack the process state and crash reports needed to decide.

## Targeted mitigation

- Separate iPhone and iPad steps, each capped at ten minutes. Still exercise iPad after an iPhone smoke failure, provided the job is not cancelled.
- Create a fresh simulator from the chosen model and oldest supported installed runtime. Avoid inherited device data and remove the unnecessary terminate-running-process launch option on a fresh installation. This is a mitigation for possible stale simulator state, not a proven root-cause fix.
- Limit each family to 480 seconds of commands, then reserve up to 60 seconds for failure diagnostics and 40 seconds for cleanup (580 seconds total plus small Python/file overhead). Launch itself is capped at 90 seconds: observed successful launches were under nine seconds. Never retry an unsuccessful launch or turn a timeout into success.
- Require a positive launch PID, wait fifteen seconds, capture a screenshot, and require successful app termination as the existing startup-survival check. Screenshot and termination failures remain fatal. No cosmetic status-bar override is required before launch.
- Record command duration, UTC completion time, exit status or timeout and partial output. On failure, save the failing phase, simulator device state, launchctl process list, recent app/SpringBoard/runningboardd system logs, and up to twenty recent crash reports (10 MB maximum each). Diagnostic failures are best effort and do not pass the test. Always attempt shutdown and deletion of the owned simulator.
- Keep build uploads before native smoke tests and diagnostic uploads under `always()`. Per-family output directories prevent overwriting iPhone evidence with iPad evidence.

## Verification and limits

Portable unittest coverage exercises real subprocess timeout/partial-output capture, shared-budget enforcement and simulated success, launch timeout, missing PID and post-launch crash paths. Run with:

```sh
python3 -m unittest discover -s tests -p test_ios_smoke.py
```

The current execution environment is Linux and cannot run Xcode or CoreSimulator. Before merging, dispatch the iOS workflow on this branch on macOS and confirm both fresh-device launches, screenshots, survival checks and cleanup; download both build and check artifacts. Repeat a cold run to assess flakiness. Also verify failure diagnostics on a deliberately invalid bundle ID or failing test app; process-state/log evidence must distinguish a responsive simulator rejecting an app from unresponsive simulator commands. A successful rerun alone cannot establish the historical timeout's cause.

The unsigned device archive remains an inspection artifact. It does not establish valid signing, provisioning, TestFlight eligibility or App Store distribution readiness.
