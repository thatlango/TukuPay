"""Offline financial-core review. Outputs are findings, never posting authority."""
import re
from collections import defaultdict

MAX_MINOR = 2**63 - 1
MAX_ROWS = 50000


def amount(value, *, zero=False):
    if not isinstance(value, str) or not re.fullmatch(r'0|[1-9][0-9]{0,18}', value):
        raise ValueError('Invalid normalized amount')
    result = int(value)
    if result > MAX_MINOR or (not zero and result == 0):
        raise ValueError('Amount out of range')
    return result


def scope(row):
    fields = tuple(row[k] for k in ('environment', 'country', 'provider', 'currency'))
    if fields[0] not in ('simulator', 'sandbox', 'production') or fields[2] not in ('mtn', 'airtel'):
        raise ValueError('Invalid scope')
    if not re.fullmatch(r'[A-Z]{2}', fields[1]) or not re.fullmatch(r'[A-Z]{3}', fields[3]):
        raise ValueError('Invalid scope')
    return fields


def ref(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', value):
        raise ValueError('Invalid reference')
    return value


def index_rows(rows, key):
    if not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError('Invalid row count')
    indexed = defaultdict(list)
    for row in rows:
        indexed[key(row)].append(row)
    return indexed


def review_settlements(proposals, provider_rows, bank_rows):
    """Compare three independently supplied normalized datasets; never approve posting.

    Bank references are scoped to environment/country/currency, not provider.
    The caller must establish statement authenticity and coverage separately.
    """
    pkey = lambda r: (*scope(r), ref(r['settlement_reference']))
    def bkey(r):
        env, country, _, currency = scope(r)
        return env, country, currency, ref(r['bank_reference'])
    proposed = index_rows(proposals, pkey)
    providers = index_rows(provider_rows, pkey)
    banks = index_rows(bank_rows, bkey)
    claims = index_rows(proposals, bkey)
    results = []
    for key, rows in sorted(proposed.items()):
        reasons = []
        if len(rows) != 1:
            reasons.append('DUPLICATE_PROPOSAL')
        p = rows[0]
        gross, fee, net = (amount(p[k], zero=k!='gross_minor') for k in ('gross_minor','fee_minor','net_minor'))
        if gross-fee != net:
            reasons.append('PROPOSAL_ARITHMETIC_MISMATCH')
        observed = providers.get(key, [])
        if len(observed) != 1:
            reasons.append('PROVIDER_EVIDENCE_MISSING_OR_DUPLICATE')
        else:
            v = observed[0]
            actual = tuple(amount(v[k], zero=k!='gross_minor') for k in ('gross_minor','fee_minor','net_minor'))
            if actual != (gross, fee, net) or v.get('status') != 'SETTLED' or v.get('bank_reference') != p['bank_reference']:
                reasons.append('PROVIDER_EVIDENCE_MISMATCH')
        bk = bkey(p)
        if len(claims[bk]) != 1:
            reasons.append('BANK_REFERENCE_REUSED')
        observed = banks.get(bk, [])
        if len(observed) != 1:
            reasons.append('BANK_EVIDENCE_MISSING_OR_DUPLICATE')
        elif amount(observed[0]['net_minor'], zero=True) != net or observed[0].get('direction') != 'CREDIT' or observed[0].get('status') != 'POSTED':
            reasons.append('BANK_EVIDENCE_MISMATCH')
        results.append({'scope': list(key[:4]), 'settlement_reference': key[4],
                        'status': 'REVIEW_REQUIRED' if reasons else 'OBSERVATIONS_MATCH',
                        'reasons': reasons, 'posting_authorized': False})
    return results


def review_dispatch(phase, provider_observation):
    """Conservative recovery classification; never returns a send/replay command."""
    if phase not in ('RESERVED', 'ATTEMPTING', 'OBSERVED'):
        raise ValueError('Unknown phase')
    if provider_observation not in ('NOT_CHECKED', 'NOT_FOUND', 'PENDING', 'TERMINAL', 'UNAVAILABLE'):
        raise ValueError('Unknown observation')
    if provider_observation == 'TERMINAL':
        return 'REVIEW_TERMINAL_EVIDENCE'
    if provider_observation == 'PENDING':
        return 'CONTINUE_STATUS_RECONCILIATION'
    if phase == 'RESERVED':
        return 'REVIEW_RESERVATION'
    return 'REVIEW_AMBIGUOUS_OUTCOME'


def review_journal(postings):
    """Check a normalized single-journal snapshot before human correction review."""
    if not isinstance(postings, list) or not 2 <= len(postings) <= 10000:
        raise ValueError('Invalid posting count')
    currencies, ids, debit, credit = set(), set(), 0, 0
    for p in postings:
        identity = ref(p['posting_id'])
        if identity in ids:
            raise ValueError('Duplicate posting')
        ids.add(identity)
        ref(p['account_id'])
        currency = p['currency']
        if not re.fullmatch(r'[A-Z]{3}', currency):
            raise ValueError('Invalid currency')
        currencies.add(currency)
        value = amount(p['amount_minor'])
        if p['side'] == 'DEBIT':
            debit += value
        elif p['side'] == 'CREDIT':
            credit += value
        else:
            raise ValueError('Invalid posting side')
    return {'balanced': len(currencies)==1 and debit==credit, 'debits_minor': str(debit),
            'credits_minor': str(credit), 'correction_authorized': False}
