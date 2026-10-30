"""Portable failure-path tests; native simulator verification still runs on macOS."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ios_smoke', Path(__file__).resolve().parents[1] / 'scripts/ios-smoke.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def test_timeout_preserves_partial_output(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(smoke, 'output', Path(directory)):
                with self.assertRaises(subprocess.TimeoutExpired):
                    smoke.run(sys.executable, '-u', '-c', 'import time; print("before hang"); time.sleep(30)', timeout=.2)
                log = (Path(directory) / 'commands.log').read_text()
                self.assertIn('before hang', log)
                self.assertIn('timeout=', log)

    def test_shared_budget_caps_command_timeout(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(smoke, 'output', Path(directory)), patch.object(smoke, 'deadline', smoke.time.monotonic() + .1):
                with self.assertRaises(subprocess.TimeoutExpired):
                    smoke.run(sys.executable, '-c', 'import time; time.sleep(30)', timeout=240)

    def exercise(self, failure=None):
        calls = []
        def run(*args, **kwargs):
            calls.append(args)
            command = args[2]
            if command == 'list':
                return json.dumps({'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [
                    {'name': 'iPad mini', 'deviceTypeIdentifier': 'mini'}]}})
            if command == 'create':
                return 'test-udid\n'
            if command == 'launch':
                if failure == 'timeout':
                    raise subprocess.TimeoutExpired(args, 90)
                return 'missing PID' if failure == 'pid' else 'cc.ccwu.mytest.atlas: 123\n'
            if command == 'terminate' and failure == 'crash':
                raise subprocess.CalledProcessError(3, args)
            return ''
        with tempfile.TemporaryDirectory() as directory:
            import os
            previous = os.getcwd()
            os.chdir(directory)
            try:
                with patch.object(smoke, 'run', side_effect=run), patch.object(smoke.time, 'sleep'), patch.object(smoke, 'diagnostics') as diagnostics:
                    if failure:
                        with self.assertRaises((RuntimeError, subprocess.TimeoutExpired, subprocess.CalledProcessError)):
                            smoke.smoke('iPad')
                        diagnostics.assert_called_once()
                    else:
                        smoke.smoke('iPad')
                        diagnostics.assert_not_called()
                result = json.loads(Path('build/ios-smoke/iPad/result.json').read_text())
            finally:
                os.chdir(previous)
        self.assertEqual(sum(c[2] == 'launch' for c in calls), 1)
        self.assertEqual([c[2] for c in calls[-2:]], ['shutdown', 'delete'])
        return calls, result

    def test_success_requires_survival_check(self):
        calls, result = self.exercise()
        self.assertIn('terminate', [c[2] for c in calls])
        self.assertEqual(result['status'], 'passed')

    def test_launch_timeout_is_not_retried_or_passed(self):
        _, result = self.exercise('timeout')
        self.assertEqual(result['phase'], 'launch')
        self.assertEqual(result['status'], 'failed')

    def test_missing_pid_fails(self):
        self.exercise('pid')

    def test_crash_fails(self):
        _, result = self.exercise('crash')
        self.assertEqual(result['phase'], 'survival')


if __name__ == '__main__':
    unittest.main()
