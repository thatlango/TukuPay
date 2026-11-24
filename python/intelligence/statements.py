"""Strict import of normalized independent financial statement CSV files.

Not an operator-specific parser. The operator must map and validate the original
statement against this schema. Never infer completeness from a file's presence.
"""
import csv
import hashlib
import io
import re
from pathlib import Path
from intelligence import minor, instant, identity, STATES

FIELDS=("reference","country","provider","currency","environment","kind","status","amount_minor","timestamp")
MAX_BYTES=32*1024*1024
MAX_ROWS=50_000

def load_statement_csv(path):
    with Path(path).open("rb") as source:
        raw=source.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:
        raise ValueError("statement file too large")
    reader=csv.DictReader(io.StringIO(raw.decode("utf-8-sig"),newline=""),strict=True)
    if reader.fieldnames is None or len(reader.fieldnames)!=len(FIELDS) or set(reader.fieldnames)!=set(FIELDS):
        raise ValueError("statement CSV requires exact normalized columns")
    records=[]
    for row in reader:
        if len(records)>=MAX_ROWS:
            raise ValueError("statement row limit exceeded")
        if None in row or any(v is None or len(v)>256 for v in row.values()):
            raise ValueError("invalid statement row")
        identity(row)
        minor(row["amount_minor"])
        instant(row["timestamp"])
        if row["status"] not in STATES:
            raise ValueError("invalid status")
        records.append(row)
    return records,{"format":"normalized-csv-v1","sha256":hashlib.sha256(raw).hexdigest(),"row_count":len(records)}
