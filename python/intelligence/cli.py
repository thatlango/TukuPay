"""Offline CLI. Reads a bounded snapshot file and emits JSON review suggestions."""
import argparse
import json
from pathlib import Path
from intelligence import analyze

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot",type=Path)
    args=parser.parse_args()
    try:
        with args.snapshot.open("rb") as stream:
            raw=stream.read(32*1024*1024+1)
        if len(raw)>32*1024*1024:
            raise ValueError("snapshot exceeds 32 MiB")
        data=json.loads(raw)
        if not isinstance(data,dict):
            raise ValueError("snapshot must be an object")
        result=analyze(data)
    except (OSError,ValueError,KeyError,TypeError,OverflowError) as exc:
        parser.exit(2,"Invalid snapshot ("+type(exc).__name__+"). Check schema and input.\n")
    print(json.dumps(result,indent=2,sort_keys=True))

if __name__=="__main__":
    main()
