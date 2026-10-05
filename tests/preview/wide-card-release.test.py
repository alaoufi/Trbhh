import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).parents[2] / 'scripts/release/wide-card-release.py'
spec = importlib.util.spec_from_file_location('wide', path)
wide = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wide)

class ReleaseTest(unittest.TestCase):
    def test_rejects_wrong_running_release(self):
        old = {'Id':'old','Image':'old-image','Config':{'Labels':{'org.opencontainers.image.revision':'wrong'}}}
        with self.assertRaises(ValueError):
            wide.validate_original(old, old)

    def test_rejects_replaced_container(self):
        old = {'Id':'old','Image':'old-image','Config':{'Labels':{'org.opencontainers.image.revision':wide.BASE}}}
        with self.assertRaises(ValueError):
            wide.validate_original(old, {**old,'Id':'another'})

    def test_accepts_exact_snapshot(self):
        old = {'Id':'old','Image':'old-image','Config':{'Labels':{'org.opencontainers.image.revision':wide.BASE}}}
        wide.validate_original(old, old)

    def test_css_only_runtime_diff(self):
        wide.validate_changes('src/components/home-dense-feed.module.css\n')
        with self.assertRaises(ValueError):
            wide.validate_changes('src/components/home-dense-feed.module.css\nprisma/schema.prisma\n')

if __name__ == '__main__':
    unittest.main()
