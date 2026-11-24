"""Generate a private review report from explicit local normalized evidence.
No operator credentials, network access, scheduler, or financial writes.
"""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import tempfile
from intelligence import analyze, instant
from statements import load_statement_csv
from treasury import treasury_report
from risk import activity_indicators

MAX_BYTES=32*1024*1024

def read_json(path):
    with Path(path).open("rb") as source:
        raw=source.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES: raise ValueError("input too large")
    return json.loads(raw),hashlib.sha256(raw).hexdigest()

def generate(snapshot_path, statements, complete=False):
    data,digest=read_json(snapshot_path)
    if not isinstance(data,dict): raise ValueError("snapshot object required")
    if complete and not statements: raise ValueError("complete statements requires independent inputs")
    if len(statements)>20: raise ValueError("statement file limit exceeded")
    records=[]; provenance=[]; seen=set()
    for path in statements:
        if path.suffix.lower()==".csv":
            rows,meta=load_statement_csv(path)
        else:
            rows,sha=read_json(path)
            if not isinstance(rows,list): raise ValueError("statement array required")
            meta={"format":"normalized-json-v1","sha256":sha,"row_count":len(rows)}
        if meta["sha256"] in seen: raise ValueError("duplicate statement file")
        seen.add(meta["sha256"])
        records.extend(rows)
        if len(records)>50_000: raise ValueError("statement row limit exceeded")
        provenance.append(meta)
    # Never treat statements embedded in an internal export as independent inputs.
    data["statements"]=records
    data["statement_coverage_complete"]=complete
    report=analyze(data)
    report["treasury"]=treasury_report(data.get("treasury"),instant(data["as_of"]))
    report["activity_indicators"]=activity_indicators(data)
    report["provenance"]={"snapshot_sha256":digest,"statement_files":provenance}
    return report

def write_report(output,report):
    output=Path(output)
    parent=output.parent
    if not parent.is_dir(): raise ValueError("private output directory must exist")
    if os.name!="nt" and parent.stat().st_mode&0o077: raise ValueError("output directory must be private")
    # No overwriting evidence: operator chooses a new output filename per run.
    encoded=(json.dumps(report,sort_keys=True,indent=2)+"\n").encode()
    if len(encoded)>MAX_BYTES: raise ValueError("report exceeds size limit")
    temp=None
    try:
        with tempfile.NamedTemporaryFile(dir=parent,prefix=".report-",delete=False) as stream:
            temp=Path(stream.name)
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        # Atomic publication with exclusive destination; does not replace prior evidence.
        os.link(temp,output)
    finally:
        if temp is not None: temp.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot",type=Path)
    parser.add_argument("--statement",action="append",default=[],type=Path)
    parser.add_argument("--complete-statements",action="store_true")
    parser.add_argument("--output",required=True,type=Path)
    args=parser.parse_args()
    try:
        report=generate(args.snapshot,args.statement,args.complete_statements)
        write_report(args.output,report)
    except (OSError,ValueError,KeyError,TypeError,OverflowError,csv.Error) as exc:
        parser.exit(2,"Batch rejected ("+type(exc).__name__+"). Check inputs and output location.\n")
    print("Review report created; no financial state changes.")

if __name__=="__main__":
    main()
