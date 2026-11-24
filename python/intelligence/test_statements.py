import tempfile
import unittest
from pathlib import Path
from statements import load_statement_csv

HEADER="reference,country,provider,currency,environment,kind,status,amount_minor,timestamp\n"
ROW="test-1,UG,mtn,UGX,simulator,collection,SUCCESSFUL,1000,2026-11-23T12:00:00Z\n"

class StatementTests(unittest.TestCase):
    def read(self, contents):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"statement.csv"
            path.write_text(contents,encoding="utf-8")
            return load_statement_csv(path)
    def test_normalized_import_with_digest(self):
        rows,metadata=self.read(HEADER+ROW)
        self.assertEqual(rows[0]["amount_minor"],"1000")
        self.assertEqual(metadata["row_count"],1)
        self.assertEqual(len(metadata["sha256"]),64)
    def test_extra_columns_and_invalid_amount(self):
        for data in [HEADER.rstrip()+" ,phone\n"+ROW,HEADER+ROW.replace(",1000,",",1000.5,"),HEADER+ROW.rstrip()+",extra\n",HEADER+ROW.replace("simulator","unknown")]:
            with self.assertRaises(ValueError):
                self.read(data)
    def test_duplicates_preserved_for_reconciliation(self):
        rows,_=self.read(HEADER+ROW+ROW)
        self.assertEqual(len(rows),2)
    def test_blank_file_requires_schema(self):
        with self.assertRaises(ValueError):
            self.read("")
