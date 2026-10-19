"""Boot the packaged app on real iOS simulator runtimes, with no signing identity."""
import json
from pathlib import Path
import subprocess
import time


def run(*args, timeout=240):
    return subprocess.check_output(args, text=True, timeout=timeout)


output = Path('build/ios-smoke')
output.mkdir(parents=True, exist_ok=True)
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))['devices']
# Latest installed iOS runtime, keeping iPhone and iPad on the same runtime.
runtimes = sorted((r for r in devices if '.iOS-' in r), key=lambda r: tuple(map(int, r.split('.iOS-')[1].split('-'))), reverse=True)
if not runtimes:
    raise SystemExit('No iOS simulator runtime installed')
for family in ['iPhone', 'iPad']:
    candidates = [d for d in devices[runtimes[0]] if d['name'].startswith(family)]
    if not candidates:
        raise SystemExit(f'No {family} simulator available')
    device = candidates[0]
    udid = device['udid']
    print(f'Booting {device["name"]}', flush=True)
    if device['state'] != 'Booted':
        run('xcrun', 'simctl', 'boot', udid)
    run('xcrun', 'simctl', 'bootstatus', udid, '-b')
    run('xcrun', 'simctl', 'install', udid, 'build/ios/Build/Products/Debug-iphonesimulator/App.app')
    run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100')
    result = run('xcrun', 'simctl', 'launch', '--terminate-running-process', udid, 'cc.ccwu.mytest.atlas')
    print(device['name'], result, flush=True)
    time.sleep(15)
    run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / f'{family}.png'))
    try:
        logs = run('xcrun', 'simctl', 'spawn', udid, 'log', 'show', '--last', '1m', '--style', 'compact', '--predicate', 'process == "App"', timeout=30)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        logs = f'Optional unified log collection unavailable: {error}'
    (output / f'{family}.log').write_text(logs)
    run('xcrun', 'simctl', 'terminate', udid, 'cc.ccwu.mytest.atlas')
    run('xcrun', 'simctl', 'shutdown', udid)
