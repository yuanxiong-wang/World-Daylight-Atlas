"""Launch the bundled app on iOS simulators, without an Apple signing identity."""
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time

output = Path('build/ios-smoke')
output.mkdir(parents=True, exist_ok=True)


def run(*args, timeout=240):
    print(' '.join(args), flush=True)
    # A file avoids hanging on a pipe held open by simctl's spawned processes.
    with tempfile.TemporaryFile() as stream:
        process = subprocess.Popen(args, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise
        finally:
            stream.seek(0)
            result = stream.read().decode(errors='replace')
            with (output / 'commands.log').open('a') as log:
                log.write(' '.join(args) + '\n' + result + '\n')
        if process.returncode:
            raise subprocess.CalledProcessError(process.returncode, args, output=result)
        return result


devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))['devices']
runtimes = sorted((r for r in devices if '.iOS-' in r), key=lambda r: tuple(map(int, r.split('.iOS-')[1].split('-'))), reverse=True)
runtimes = [r for r in runtimes if int(r.split('.iOS-')[1].split('-')[0]) >= 17
            and all(any(d['name'].startswith(family) for d in devices[r]) for family in ['iPhone', 'iPad'])]
if not runtimes:
    raise SystemExit('No supported iOS simulator runtime installed')
# iOS 26 simulator cold starts can exceed ten minutes on hosted runners. Exercise
# the oldest installed supported runtime; builds still use the latest Xcode SDK.
runtime = runtimes[-1]
print(f'Simulator runtime: {runtime}', flush=True)
for family in ['iPhone', 'iPad']:
    candidates = [d for d in devices[runtime] if d['name'].startswith(family)]
    if not candidates:
        raise SystemExit(f'No {family} simulator available')
    # Prefer smaller tablets on hosted runners; the UI is compact on every iPad.
    if family == 'iPad':
        candidates.sort(key=lambda d: (0 if 'mini' in d['name'] else 1 if '11-inch' in d['name'] else 2, d['name']))
    device = candidates[0]
    udid = device['udid']
    print(f'Booting {device["name"]}', flush=True)
    if device['state'] != 'Booted':
        run('xcrun', 'simctl', 'boot', udid)
    run('xcrun', 'simctl', 'bootstatus', udid, '-b')
    run('xcrun', 'simctl', 'install', udid, 'build/ios/Build/Products/Debug-iphonesimulator/App.app')
    run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100')
    print(run('xcrun', 'simctl', 'launch', '--terminate-running-process', udid, 'cc.ccwu.mytest.atlas'), flush=True)
    time.sleep(15)
    run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / f'{family}.png'))
    # Termination also confirms the app survived startup instead of crashing.
    run('xcrun', 'simctl', 'terminate', udid, 'cc.ccwu.mytest.atlas', timeout=45)
    # Shutdown is runner housekeeping; screenshot/launch errors remain failures.
    try:
        run('xcrun', 'simctl', 'shutdown', udid, timeout=30)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        print(f'Simulator cleanup did not finish: {error}', flush=True)
