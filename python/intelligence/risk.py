"""Explainable aggregate activity indicators, not customer fraud scores."""
from collections import defaultdict,deque
from datetime import timedelta
from intelligence import identity,instant

def activity_indicators(snapshot):
    as_of=instant(snapshot["as_of"])
    begin=instant(snapshot["window_start"])
    grouped=defaultdict(list)
    seen=set(); duplicates=set()
    for row in snapshot["transactions"]:
        key=identity(row)
        if key in seen: duplicates.add(key)
        seen.add(key)
    for row in snapshot["transactions"]:
        key=identity(row)
        if key in duplicates or "created_at" not in row: continue
        stamp=instant(row["created_at"])
        if stamp<begin or stamp>as_of: continue
        grouped[key[:5]].append((stamp,row["status"]))
    summaries=[]
    for key,events in sorted(grouped.items()):
        events.sort()
        window=deque(); peak=0; failures=0
        for stamp,status in events:
            while window and window[0]<stamp-timedelta(minutes=5): window.popleft()
            window.append(stamp); peak=max(peak,len(window))
            if status in {"FAILED","CANCELLED","EXPIRED"}: failures+=1
        summaries.append(dict(country=key[0],provider=key[1],currency=key[2],environment=key[3],kind=key[4],
            observed_count=len(events),peak_five_minute_count=peak,terminal_unsuccessful_count=failures,
            unsuccessful_share_basis_points=(failures*10_000)//len(events)))
    return {"status":"DESCRIPTIVE_ONLY","scopes":summaries,
            "note":"Counts only unique references with explicit creation times. Compare with a verified historical baseline before interpreting elevated activity."}
