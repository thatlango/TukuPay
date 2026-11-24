import unittest
from intelligence import analyze, minor

def row(ref="r1", amount="1000", status="SUCCESSFUL", currency="UGX", environment="simulator", kind="collection", timestamp="2026-11-22T10:00:00Z"):
    return dict(reference=ref,amount_minor=amount,status=status,currency=currency,environment=environment,kind=kind,timestamp=timestamp,country="UG",provider="mtn")

def snapshot(transactions, statements, complete=False):
    return dict(schema_version=1,as_of="2026-11-24T00:00:00Z",window_start="2026-11-10T00:00:00Z",transactions=transactions,statements=statements,complete_daily_history=complete)

class IntelligenceTests(unittest.TestCase):
    def test_exact_match_and_mismatch(self):
        self.assertEqual(analyze(snapshot([row()],[row()]))["matched_successful"],1)
        report=analyze(snapshot([row()],[row(amount="1001")]))
        self.assertEqual(report["finding_counts"],{"AMOUNT_MISMATCH":1})
        self.assertEqual(report["matched_successful"],0)
    def test_duplicates_and_missing(self):
        report=analyze(snapshot([row(),row(),row("r2")],[row(),row("r3")]))
        self.assertEqual(report["finding_counts"],{"DUPLICATE_REFERENCE":1,"MISSING_STATEMENT_EVIDENCE":1,"UNMATCHED_STATEMENT":1})
    def test_environment_and_currency_isolation(self):
        report=analyze(snapshot([row()],[row(environment="production"),row(currency="USD")]))
        self.assertEqual(report["matched_successful"],0)
        self.assertEqual(report["finding_counts"],{"MISSING_STATEMENT_EVIDENCE":1,"UNMATCHED_STATEMENT":2})
    def test_stale_pending_and_status_mismatch(self):
        report=analyze(snapshot([row(status="PENDING")],[row()]))
        self.assertEqual(report["finding_counts"],{"STALE_PENDING":1,"STATUS_MISMATCH":1})
    def test_integer_baseline_and_coverage(self):
        inputs=[row("p1",amount="14000",kind="payout")]
        self.assertEqual(analyze(snapshot(inputs,inputs))["liquidity_baseline"],[])
        baseline=analyze(snapshot(inputs,inputs,True))["liquidity_baseline"][0]
        self.assertEqual(baseline["mean_daily_payout_minor"],"1000")
        self.assertEqual(baseline["seven_day_payout_baseline_minor"],"7000")
    def test_unusual_amount(self):
        inputs=[row("r"+str(i)) for i in range(10)]+[row("outlier",amount="6000")]
        self.assertEqual(analyze(snapshot(inputs,inputs))["finding_counts"],{"UNUSUAL_AMOUNT":1})
    def test_invalid_input(self):
        for value in ["0","1.0","-1","9223372036854775808",100]:
            with self.assertRaises(ValueError): minor(value)
        with self.assertRaises(ValueError): analyze(snapshot([row(timestamp="2026-11-25T00:00:00Z")],[]))

if __name__=="__main__":
    unittest.main()
