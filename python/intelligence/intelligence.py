"""Read-only deterministic financial intelligence; no network or database writes."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import re

MAX_MINOR = 2**63 - 1
CURRENCIES = {"BIF","CDF","EUR","GHS","GNF","KES","LRD","MGA","MWK","NGN","RWF","SCR","SSP","SZL","TZS","UGX","USD","XAF","XOF","ZAR","ZMW"}
STATES = {"CREATED","APPROVAL_REQUIRED","APPROVED","PENDING","SUCCESSFUL","FAILED","CANCELLED","EXPIRED"}
MODES = {"simulator","sandbox","production"}

def minor(value):
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", value):
        raise ValueError("amount_minor must be a positive integer string")
    amount = int(value)
    if amount > MAX_MINOR:
        raise ValueError("amount_minor exceeds database range")
    return amount

def instant(value):
    if not isinstance(value, str):
        raise ValueError("timestamp must be ISO-8601")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return dt.astimezone(timezone.utc)

def dimension(row):
    country, provider, currency, environment = (row[k] for k in ("country","provider","currency","environment"))
    if not isinstance(country,str) or not re.fullmatch("[A-Z]{2}",country):
        raise ValueError("invalid country")
    if not isinstance(provider,str) or not re.fullmatch("[a-z][a-z0-9_-]{0,31}",provider):
        raise ValueError("invalid provider")
    if currency not in CURRENCIES or environment not in MODES:
        raise ValueError("invalid currency or environment")
    return country, provider, currency, environment

def identity(row):
    reference = row["reference"]
    kind = row["kind"]
    if not isinstance(reference,str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}",reference):
        raise ValueError("invalid reference")
    if kind not in {"collection","payout"}:
        raise ValueError("invalid kind")
    return (*dimension(row),kind,reference)

def analyze(snapshot):
    """Return review candidates only. Missing evidence never authorizes movement of money."""
    if snapshot.get("schema_version") != 1:
        raise ValueError("unsupported snapshot schema")
    as_of = instant(snapshot["as_of"])
    internal, external = snapshot["transactions"], snapshot["statements"]
    if not isinstance(internal,list) or not isinstance(external,list) or len(internal)+len(external)>100_000:
        raise ValueError("snapshot row limit exceeded")
    begin = instant(snapshot["window_start"])
    if begin >= as_of:
        raise ValueError("invalid snapshot window")
    indexes = []
    for rows in (internal,external):
        index = defaultdict(list)
        for row in rows:
            if not isinstance(row,dict):
                raise ValueError("invalid row")
            amount = minor(row["amount_minor"])
            timestamp = instant(row["timestamp"])
            if timestamp < begin or timestamp > as_of:
                raise ValueError("timestamp outside snapshot window")
            if row["status"] not in STATES:
                raise ValueError("invalid status")
            index[identity(row)].append((row,amount,timestamp))
        indexes.append(index)
    tx, st = indexes
    findings = []
    matched = 0
    totals=defaultdict(Counter)
    def flag(key,code,severity):
        country,provider,currency,environment,kind,ref = key
        findings.append(dict(country=country,provider=provider,currency=currency,environment=environment,
                             kind=kind,reference=ref,code=code,severity=severity))
    for key in sorted(tx.keys() | st.keys()):
        a,b = tx.get(key,[]),st.get(key,[])
        group=totals[key[:5]]
        group['internal_rows']+=len(a)
        group['statement_rows']+=len(b)
        if len(a)==1 and a[0][0]['status']=='SUCCESSFUL': group['internal_success_minor']+=a[0][1]
        if len(b)==1 and b[0][0]['status']=='SUCCESSFUL': group['statement_success_minor']+=b[0][1]
        if len(a)>1 or len(b)>1:
            flag(key,"DUPLICATE_REFERENCE","high")
            continue
        if not a:
            flag(key,"UNMATCHED_STATEMENT","high")
            continue
        row,amount,timestamp = a[0]
        created=instant(row.get("created_at",row["timestamp"]))
        if created>timestamp:
            raise ValueError("created_at after observation")
        if row["status"] in {"CREATED","PENDING","APPROVED"} and as_of-created>=timedelta(minutes=30):
            flag(key,"STALE_PENDING","medium")
        if not b:
            if row["status"]=="SUCCESSFUL" and snapshot.get("statement_coverage_complete") is True:
                flag(key,"MISSING_STATEMENT_EVIDENCE","high")
            continue
        other,actual,_ = b[0]
        if amount != actual:
            flag(key,"AMOUNT_MISMATCH","high")
        elif row["status"] != other["status"]:
            flag(key,"STATUS_MISMATCH","high")
        elif row["status"]=="SUCCESSFUL":
            matched += 1
            group['matched_count']+=1
            group['matched_minor']+=amount

    # Deterministic risk heuristics, not a fraud classifier. Exclude ambiguous duplicates.
    amounts = defaultdict(list)
    daily = defaultdict(Counter)
    first_day = as_of.date()-timedelta(days=14)
    last_day = as_of.date()-timedelta(days=1)
    for key,rows in tx.items():
        if len(rows)!=1:
            continue
        row,amount,timestamp=rows[0]
        if row["status"]!="SUCCESSFUL":
            continue
        group=key[:5]
        amounts[group].append((key,amount))
        if first_day<=timestamp.date()<=last_day:
            daily[key[:4]][(timestamp.date(),key[4])]+=amount
    for group,entries in amounts.items():
        if len(entries)>=10:
            ordered=sorted(amount for _,amount in entries)
            n=len(ordered)
            # Twice the median, using exact integers.
            twice_median=ordered[n//2]*2 if n%2 else ordered[n//2-1]+ordered[n//2]
            for key,amount in entries:
                if amount*2>twice_median*5:
                    flag(key,"UNUSUAL_AMOUNT","medium")
    # A baseline, not a cash balance forecast. Include zero days only if the
    # caller explicitly attests to complete coverage for the prior 14 UTC days.
    forecasts=[]
    complete=snapshot.get("complete_daily_history") is True and begin<=datetime.combine(first_day,datetime.min.time(),timezone.utc)
    if complete:
        for group,counts in sorted(daily.items()):
            values=[counts[(first_day+timedelta(days=i),"payout")] for i in range(14)]
            inflows=[counts[(first_day+timedelta(days=i),"collection")] for i in range(14)]
            forecasts.append(dict(country=group[0],provider=group[1],currency=group[2],environment=group[3],
                sample_days=14,mean_daily_payout_minor=str((sum(values)+13)//14),
                peak_daily_payout_minor=str(max(values)),mean_daily_collection_minor=str((sum(inflows)+13)//14),
                seven_day_payout_baseline_minor=str((sum(values)*7+13)//14)))
    summary=[]
    for key,values in sorted(totals.items()):
        country,provider,currency,environment,kind=key
        summary.append(dict(country=country,provider=provider,currency=currency,environment=environment,kind=kind,
                            internal_rows=values["internal_rows"],statement_rows=values["statement_rows"],matched_count=values["matched_count"],
                            internal_success_minor=str(values["internal_success_minor"]),statement_success_minor=str(values["statement_success_minor"]),
                            matched_minor=str(values["matched_minor"]),observed_difference_minor=str(values["internal_success_minor"]-values["statement_success_minor"])))
    return {"reconciliation_by_scope":summary,"schema_version":1,"as_of":as_of.isoformat(),"transaction_count":len(internal),
            "statement_count":len(external),"matched_successful":matched,"findings":findings,
            "finding_counts":dict(sorted(Counter(f["code"] for f in findings).items())),
            "liquidity_baseline":forecasts,"baseline_history_complete":complete,"statement_coverage_complete":snapshot.get("statement_coverage_complete") is True,
            "decision":"HUMAN_REVIEW_ONLY","limitations":["No automatic fraud classification","No financial status changes","No actual balance or liquidity forecast without funding and settlement data"]}
