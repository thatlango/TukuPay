"""Read-only treasury scenarios from explicitly supplied, normalized evidence."""
from collections import defaultdict
from datetime import timedelta
import re
from intelligence import dimension, instant, minor

def nonnegative(value):
    if value=="0": return 0
    return minor(value)

def treasury_report(data, as_of):
    if data is None:
        return {"status":"NOT_SUPPLIED","funding":[],"settlements":[]}
    if not isinstance(data,dict):
        raise ValueError("invalid treasury input")
    balances=data.get("balances",[])
    obligations=data.get("obligations",[])
    settlements=data.get("settlements",[])
    if any(not isinstance(x,list) for x in (balances,obligations,settlements)) or sum(map(len,(balances,obligations,settlements)))>50_000:
        raise ValueError("invalid treasury row count")
    by_scope={}
    for row in balances:
        key=dimension(row)
        # Collection balances are not assumed spendable for payouts.
        account=row["account"]
        if account not in {"collection","disbursement"}:
            raise ValueError("invalid balance account")
        stamp=instant(row["timestamp"])
        if stamp>as_of: raise ValueError("future balance")
        scope=(*key,account)
        if scope in by_scope: raise ValueError("duplicate balance scope")
        by_scope[scope]=(nonnegative(row["available_minor"]),stamp)
    due=defaultdict(int)
    seen=set()
    for row in obligations:
        key=dimension(row)
        ref=row["reference"]
        if not isinstance(ref,str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}",ref) or (*key,ref) in seen:
            raise ValueError("invalid or duplicate obligation")
        seen.add((*key,ref))
        deadline=instant(row["due_at"])
        amount=minor(row["amount_minor"])
        fee=nonnegative(row["estimated_fee_minor"])
        if deadline<=as_of+timedelta(days=7):
            due[key]+=amount+fee
    scopes={key[:4] for key in by_scope}|set(due)
    funding=[]
    for key in sorted(scopes):
        balance=by_scope.get((*key,"disbursement"))
        collect=by_scope.get((*key,"collection"))
        available=balance[0] if balance else None
        fresh=balance is not None and as_of-balance[1]<=timedelta(minutes=60)
        complete=data.get("obligations_complete") is True
        required=due[key]
        # A scenario, not authorization to transfer or replenish a wallet.
        gap=max(0,required-available) if fresh and complete else None
        funding.append(dict(country=key[0],provider=key[1],currency=key[2],environment=key[3],
            collection_balance_minor=str(collect[0]) if collect else None,
            disbursement_balance_minor=str(available) if available is not None else None,
            balance_as_of=balance[1].isoformat() if balance else None,
            seven_day_obligations_minor=str(required),funding_gap_minor=str(gap) if gap is not None else None,
            evidence="SCENARIO" if fresh and complete else "INCOMPLETE_OR_STALE"))
    fees=[]
    seen=set()
    for row in settlements:
        key=dimension(row)
        ref=row["reference"]
        if not isinstance(ref,str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}",ref) or (*key,ref) in seen:
            raise ValueError("invalid or duplicate settlement reference")
        seen.add((*key,ref))
        if instant(row["timestamp"])>as_of: raise ValueError("future settlement")
        gross=minor(row["gross_minor"]); actual=nonnegative(row["actual_fee_minor"])
        expected=nonnegative(row["expected_fee_minor"]); net=nonnegative(row["net_minor"])
        fees.append(dict(country=key[0],provider=key[1],currency=key[2],environment=key[3],reference=ref,
            gross_minor=str(gross),actual_fee_minor=str(actual),expected_fee_minor=str(expected),net_minor=str(net),
            fee_difference_minor=str(actual-expected),net_difference_minor=str(gross-actual-net),
            status="REVIEW" if actual!=expected or gross-actual!=net else "ARITHMETIC_MATCH"))
    return {"status":"HUMAN_REVIEW_ONLY","funding":funding,"settlements":fees,
            "note":"Scenarios assume supplied obligations and fees; no cash transfer recommendation or independent balance verification."}
