import tempfile
import unittest
from pathlib import Path
from run_batch import generate,write_report
FIXTURES=Path(__file__).parent/"fixtures"
class BatchTests(unittest.TestCase):
    def test_independent_statement_and_provenance(self):
        report=generate(FIXTURES/"sample.json",[FIXTURES/"statement.csv"])
        self.assertEqual(report["matched_successful"],1)
        self.assertFalse(report["statement_coverage_complete"])
        self.assertEqual(len(report["provenance"]["statement_files"]),1)
    def test_duplicate_file_rejected(self):
        with self.assertRaises(ValueError):
            generate(FIXTURES/"sample.json",[FIXTURES/"statement.csv"]*2)
    def test_complete_requires_statement(self):
        with self.assertRaises(ValueError):
            generate(FIXTURES/"sample.json",[],True)
    def test_private_report_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"report.json"
            write_report(path,{"test":1})
            self.assertTrue(path.exists())
            with self.assertRaises(FileExistsError): write_report(path,{"test":2})
            self.assertIn('"test": 1',path.read_text())
