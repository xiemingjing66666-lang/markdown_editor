import sys
import unittest
from pathlib import Path

from app import association


class AssociationTests(unittest.TestCase):
    def test_prog_id_and_extensions(self):
        self.assertEqual(association.PROG_ID, "Zhijian.md")
        self.assertIn(".md", association.EXTENSIONS)
        self.assertIn(".markdown", association.EXTENSIONS)

    def test_source_command_quotes_launcher(self):
        command = association._open_command()
        self.assertIn('"%1"', command)
        self.assertIn("run.py", command)

    def test_executable_is_absolute(self):
        self.assertTrue(Path(association._executable()).is_absolute())


if __name__ == "__main__":
    unittest.main()
