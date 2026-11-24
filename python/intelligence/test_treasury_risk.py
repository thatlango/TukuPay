import unittest
from datetime import datetime,timezone
from treasury import treasury_report
from risk import activity_indicators

SCOPE=dict(country="UG",provider="mtn",currency="UGX",environment="simulator")
NOW=datetime(2026,11,24,12,tzinfo=timezone.utc)
BAL=dict(SCOPE,account="disbursement",available_minor="1000",timestamp="2026-11-24T11:45:00Z")
OB=dict(SCOPE,reference="o1",amount_minor="1400",estimated_fee_minor="100",due_at="2026-11-25T12:00:00Z")
SET=dict(SCOPE,reference="s1",gross_minor="1000",actual_fee_minor="10",expected_fee_minor="5",net_minor="989",timestamp="2026-11-24T10:00:00Z")
class TreasuryRiskTests(unittest.TestCase):
    def test_gap_requires_fresh_balance_and_complete_obligations(self):
        data=dict(balances=[BAL],obligations=[OB],obligations_complete=True)
        self.assertEqual(treasury_report(data,NOW)["funding"][0]["funding_gap_minor"],"500")
        data["obligations_complete"]=False
        self.assertIsNone(treasury_report(data,NOW)["funding"][0]["funding_gap_minor"])
        data["obligations_complete"]=True
        data["balances"]=[dict(BAL,timestamp="2026-11-24T09:00:00Z")]
        self.assertIsNone(treasury_report(data,NOW)["funding"][0]["funding_gap_minor"])
    def test_collection_balance_not_available_for_payout(self):
        data=dict(balances=[dict(BAL,account="collection")],obligations=[OB],obligations_complete=True)
        self.assertIsNone(treasury_report(data,NOW)["funding"][0]["funding_gap_minor"])
    def test_settlement_fee_and_net_difference(self):
        row=treasury_report(dict(settlements=[SET]),NOW)["settlements"][0]
        self.assertEqual(row["fee_difference_minor"],"5")
        self.assertEqual(row["net_difference_minor"],"1")
        self.assertEqual(row["status"],"REVIEW")
    def test_duplicate_obligation_rejected(self):
        with self.assertRaises(ValueError): treasury_report(dict(obligations=[OB,OB]),NOW)
    def test_velocity_scope_and_duplicate_exclusion(self):
        rows=[dict(SCOPE,reference=str(i),kind="collection",status="FAILED" if i==0 else "PENDING",
            created_at="2026-11-24T11:00:00Z") for i in range(3)]
        snap=dict(as_of="2026-11-24T12:00:00Z",window_start="2026-11-24T00:00:00Z",transactions=rows)
        result=activity_indicators(snap)["scopes"][0]
        self.assertEqual(result["peak_five_minute_count"],3)
        self.assertEqual(result["terminal_unsuccessful_count"],1)
        snap["transactions"]+=[rows[0]]
        self.assertEqual(activity_indicators(snap)["scopes"][0]["observed_count"],2)
