"""Launch the bundled app on iOS simulators, without an Apple signing identity."""
import argparse
import json
import os
from pathlib import Path
import signal
import re
import shutil
import subprocess
import tempfile
import time

output = Path('build/ios-smoke')
deadline = None


def run(*args, timeout=240):
    if deadline is not None:
        timeout = min(timeout, max(0.01, deadline - time.monotonic()))
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    print(' '.join(args), flush=True)
    outcome = 'failed'
    # A file avoids hanging on a pipe held open by simctl's spawned processes.
    with tempfile.TemporaryFile() as stream:
        process = subprocess.Popen(args, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            process.wait(timeout=timeout)
            outcome = f'exit={process.returncode}'
        except subprocess.TimeoutExpired:
            outcome = f'timeout={timeout:.1f}s'
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise
        finally:
            stream.seek(0)
            result = stream.read().decode(errors='replace')
            with (output / 'commands.log').open('a') as log:
                log.write(f'{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())} {time.monotonic() - started:.1f}s {outcome} ' + ' '.join(args) + '\n' + result + '\n')
        if process.returncode:
            raise subprocess.CalledProcessError(process.returncode, args, output=result)
        return result



def best_effort(*args, timeout=20):
    try:
        return run(*args, timeout=timeout)
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        print(f'Diagnostic/cleanup command failed: {error}', flush=True)
        return None


def diagnostics(udid, started):
    # All diagnostic commands share a separate 60-second budget.
    global deadline
    deadline = time.monotonic() + 60
    best_effort('xcrun', 'simctl', 'list', 'devices', '--json')
    if udid:
        best_effort('xcrun', 'simctl', 'spawn', udid, 'launchctl', 'list')
        logs = best_effort('xcrun', 'simctl', 'spawn', udid, 'log', 'show',
                           '--last', '10m', '--style', 'compact', '--predicate',
                           'process == "App" OR process == "SpringBoard" OR process == "runningboardd"')
        if logs is not None:
            (output / 'system.log').write_text(logs)
    # Keep recent crash reports even when simctl is unresponsive. Bound copies.
    roots = [Path.home() / 'Library/Logs/DiagnosticReports']
    if udid:
        roots.append(Path.home() / f'Library/Developer/CoreSimulator/Devices/{udid}/data/Library/Logs/CrashReporter')
    reports = output / 'crashes'
    reports.mkdir(exist_ok=True)
    count = 0
    for root in roots:
        for path in root.glob('*'):
            try:
                if path.is_file() and path.stat().st_mtime >= started and path.stat().st_size <= 10_000_000:
                    shutil.copy2(path, reports / f'{count}-{path.name}')
                    count += 1
            except OSError as error:
                print(f'Crash report copy failed: {error}', flush=True)
            if count >= 20 or time.monotonic() >= deadline:
                return


def smoke(family):
    global output, deadline
    output = Path('build/ios-smoke') / family
    output.mkdir(parents=True, exist_ok=True)
    started = time.time()
    deadline = time.monotonic() + 480
    udid = None
    phase = 'discovery'
    try:
        devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))['devices']
        runtimes = sorted((r for r in devices if '.iOS-' in r),
                          key=lambda r: tuple(map(int, r.split('.iOS-')[1].split('-'))))
        runtimes = [r for r in runtimes if int(r.split('.iOS-')[1].split('-')[0]) >= 17
                    and any(d['name'].startswith(family) for d in devices[r])]
        if not runtimes:
            raise RuntimeError(f'No supported {family} simulator runtime installed')
        # Keep the oldest supported runtime policy; compile with the latest SDK.
        runtime = runtimes[0]
        candidates = [d for d in devices[runtime] if d['name'].startswith(family)]
        if family == 'iPad':
            candidates.sort(key=lambda d: (0 if 'mini' in d['name'] else 1 if '11-inch' in d['name'] else 2, d['name']))
        device = candidates[0]
        print(f'Simulator runtime: {runtime}; model: {device["name"]}', flush=True)
        # Never inherit a preinstalled app, running process, or stale device data.
        phase = 'create'
        udid = run('xcrun', 'simctl', 'create', f'Atlas-smoke-{family}',
                   device['deviceTypeIdentifier'], runtime, timeout=30).strip()
        phase = 'boot'
        run('xcrun', 'simctl', 'boot', udid, timeout=30)
        run('xcrun', 'simctl', 'bootstatus', udid, '-b')
        phase = 'install'
        run('xcrun', 'simctl', 'install', udid, 'build/ios/Build/Products/Debug-iphonesimulator/App.app', timeout=90)
        phase = 'launch'
        # Fresh installation: no implicit termination/relaunch, and no retries.
        result = run('xcrun', 'simctl', 'launch', udid, 'cc.ccwu.mytest.atlas', timeout=90)
        if not re.search(r'^cc\.ccwu\.mytest\.atlas: [1-9][0-9]*$', result, re.MULTILINE):
            raise RuntimeError(f'Launch returned no app PID: {result}')
        phase = 'survival'
        if time.monotonic() + 15 >= deadline:
            raise RuntimeError('Device smoke budget exhausted before survival check')
        time.sleep(15)
        run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / f'{family}.png'), timeout=120)
        # Fails when the app is no longer running; a screenshot alone is insufficient.
        run('xcrun', 'simctl', 'terminate', udid, 'cc.ccwu.mytest.atlas', timeout=45)
        (output / 'result.json').write_text(json.dumps({'status': 'passed', 'family': family, 'runtime': runtime}))
    except Exception as error:
        (output / 'result.json').write_text(json.dumps({
            'status': 'failed', 'phase': phase, 'error': str(error),
            'interpretation': 'A command timeout is inconclusive; inspect logs and crash reports. No retry was attempted.'}))
        diagnostics(udid, started)
        raise
    finally:
        deadline = time.monotonic() + 40
        if udid:
            best_effort('xcrun', 'simctl', 'shutdown', udid, timeout=20)
            best_effort('xcrun', 'simctl', 'delete', udid, timeout=20)
        deadline = None


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--family', required=True, choices=['iPhone', 'iPad'])
    smoke(parser.parse_args().family)
