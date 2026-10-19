import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// The native Capacitor runtime must match the pinned JavaScript bridge.
const path = 'ios/App/CapApp-SPM/Package.swift';
writeFileSync(path, readFileSync(path, 'utf8').replace(/from: "8\.[^"]+"/, 'exact: "8.5.3"'));
if (process.platform === 'darwin') {
  execFileSync('swift', ['scripts/ios-icon.swift'], { stdio: 'inherit' });
} else {
  console.log('Native project synced. App icon generation and Xcode builds require macOS.');
}
