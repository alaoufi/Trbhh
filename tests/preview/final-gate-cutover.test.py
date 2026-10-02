import copy
import importlib.util
import pathlib
import json
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gate', pathlib.Path(__file__).parents[2] / 'scripts/release/final-gate-cutover.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class CutoverConfigTest(unittest.TestCase):
    def setUp(self):
        self.original = {
            'Config': {'Image': 'old-tag', 'Hostname': 'old-container', 'Domainname': '',
                       'Env': ['DATABASE_URL=private-placeholder', 'AUTH_SECRET=private-placeholder', 'SUPPLIER_ALLOW_LIVE_ORDERS=true'],
                       'Labels': {'com.docker.compose.project': 'trbhh'}, 'Cmd': ['node', 'server.js']},
            'HostConfig': {'Binds': ['existing-storage:/app/storage'], 'PortBindings': {'3000/tcp': [{'HostPort': '3080'}]}, 'AutoRemove': False},
            'NetworkSettings': {'Networks': {'trbhh_network': {'IPAddress': '172.20.0.2'}}},
        }

    def test_preserves_runtime_and_volumes_without_mutating_snapshot(self):
        before = copy.deepcopy(self.original)
        result = gate.candidate_config(self.original, 'sha256:pinned', '123')
        self.assertEqual(self.original, before)
        self.assertEqual(result['HostConfig'], before['HostConfig'])
        self.assertIn('DATABASE_URL=private-placeholder', result['Env'])
        self.assertIn('AUTH_SECRET=private-placeholder', result['Env'])
        self.assertEqual(result['Cmd'], ['node', 'server.js'])

    def test_pins_image_and_disables_live_orders(self):
        result = gate.candidate_config(self.original, 'sha256:pinned', '123')
        self.assertEqual(result['Image'], 'sha256:pinned')
        self.assertIn('SUPPLIER_ALLOW_LIVE_ORDERS=false', result['Env'])
        self.assertNotIn('SUPPLIER_ALLOW_LIVE_ORDERS=true', result['Env'])
        self.assertIn('TRBHH_READ_ONLY_PREVIEW=0', result['Env'])
        self.assertIn('TRBHH_PREVIEW_MODE=0', result['Env'])
        self.assertEqual(result['Labels']['org.opencontainers.image.revision'], gate.CANDIDATE)
        self.assertEqual(result['NetworkingConfig']['EndpointsConfig']['trbhh_network']['Aliases'], ['app', 'trbhh-app'])

    def test_rollback_restores_original_container_not_a_rebuild(self):
        with tempfile.TemporaryDirectory() as folder:
            backup = pathlib.Path(folder)
            (backup / 'PROMOTION_STARTED').write_text('started')
            (backup / 'production-container.json').write_text(json.dumps([{'Id': 'old', 'Image': 'old-image'}]))
            states = [
                {'Id': 'old', 'Name': '/trbhh-rollback-123', 'State': {'Running': False}},
                {'Id': 'new', 'Config': {'Labels': {'trbhh.final-release': '123'}}},
                {'Image': 'old-image'},
            ]
            with patch.object(gate, 'inspect', side_effect=states), patch.object(gate, 'api') as api:
                gate.rollback(backup, '123')
                self.assertEqual([call.args[1] for call in api.call_args_list], [
                    '/containers/new/stop?t=10', '/containers/new/rename?name=trbhh-failed-123',
                    '/containers/old/rename?name=trbhh-app', '/containers/old/start'])
            self.assertEqual((backup / 'ROLLED_BACK').read_text().strip(), 'old-image')

    def test_rollback_does_not_touch_an_unrelated_container(self):
        with tempfile.TemporaryDirectory() as folder:
            backup = pathlib.Path(folder)
            (backup / 'PROMOTION_STARTED').write_text('started')
            (backup / 'production-container.json').write_text(json.dumps([{'Id': 'old', 'Image': 'old-image'}]))
            states = [{'Id': 'old', 'Name': '/trbhh-rollback-123', 'State': {'Running': False}},
                      {'Id': 'other', 'Config': {'Labels': {}}}]
            with patch.object(gate, 'inspect', side_effect=states), patch.object(gate, 'api') as api:
                with self.assertRaises(RuntimeError):
                    gate.rollback(backup, '123')
                api.assert_not_called()


if __name__ == '__main__':
    unittest.main()
