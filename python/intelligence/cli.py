"""Offline CLI. Reads a bounded snapshot file and emits JSON review suggestions."""
import argparse
import json
import csv
import hashlib
from pathlib import Path
from intelligence import analyze
from statements import load_statement_csv

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot",type=Path)
    parser.add_argument("--statements",type=Path,help="Independent normalized statement JSON array or CSV")
    parser.add_argument("--complete-statements",action="store_true",help="Attest independent statements cover entire snapshot scope")
    args=parser.parse_args()
    if args.complete_statements and not args.statements:
        parser.error("--complete-statements requires --statements")
    try:
        with args.snapshot.open("rb") as stream:
            raw=stream.read(32*1024*1024+1)
        if len(raw)>32*1024*1024:
            raise ValueError("snapshot exceeds 32 MiB")
        data=json.loads(raw)
        if not isinstance(data,dict):
            raise ValueError("snapshot must be an object")
        provenance=None
        if args.statements:
            if args.statements.suffix.lower()==".csv":
                data["statements"],provenance=load_statement_csv(args.statements)
            else:
                with args.statements.open("rb") as stream:
                    statement_raw=stream.read(32*1024*1024+1)
                if len(statement_raw)>32*1024*1024:
                    raise ValueError("statement file too large")
                data["statements"]=json.loads(statement_raw)
                provenance={"format":"normalized-json-v1","sha256":hashlib.sha256(statement_raw).hexdigest()}
            data["statement_coverage_complete"]=args.complete_statements
        result=analyze(data)
        result["provenance"]={"snapshot_sha256":hashlib.sha256(raw).hexdigest(),"independent_statement":provenance}
    except (OSError,ValueError,KeyError,TypeError,OverflowError,csv.Error) as exc:
        parser.exit(2,"Invalid snapshot ("+type(exc).__name__+"). Check schema and input.\n")
    print(json.dumps(result,indent=2,sort_keys=True))

if __name__=="__main__":
    main()
