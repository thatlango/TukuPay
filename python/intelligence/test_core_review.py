import unittest
from core_review import amount, review_settlements, review_dispatch, review_journal


class CoreReviewTests(unittest.TestCase):
    def setUp(self):
        self.p = dict(environment='simulator', country='UG', provider='mtn', currency='UGX',
                      settlement_reference='fixture-1', bank_reference='bank-1', gross_minor='1000', fee_minor='20', net_minor='980')
        self.v = dict(self.p, status='SETTLED')
        self.b = dict(self.p, status='POSTED', direction='CREDIT')

    def test_matching_is_not_authorization(self):
        result = review_settlements([self.p], [self.v], [self.b])[0]
        self.assertEqual(result['status'], 'OBSERVATIONS_MATCH')
        self.assertFalse(result['posting_authorized'])

    def test_missing_mismatched_and_duplicate_evidence(self):
        for provider, bank in (([], [self.b]), ([self.v], []), ([self.v, self.v], [self.b]),
                               ([self.v], [dict(self.b, net_minor='979')]), ([self.v], [dict(self.b, direction='DEBIT')]),
                               ([dict(self.v, environment='sandbox')], [self.b])):
            self.assertEqual(review_settlements([self.p], provider, bank)[0]['status'], 'REVIEW_REQUIRED')

    def test_bank_reference_reuse_across_providers(self):
        second = dict(self.p, provider='airtel', settlement_reference='fixture-2')
        result = review_settlements([self.p, second], [self.v, dict(second,status='SETTLED')], [self.b])
        self.assertTrue(all('BANK_REFERENCE_REUSED' in r['reasons'] for r in result))

    def test_recovery_is_review_only(self):
        self.assertEqual(review_dispatch('ATTEMPTING', 'NOT_FOUND'), 'REVIEW_AMBIGUOUS_OUTCOME')
        self.assertEqual(review_dispatch('RESERVED', 'NOT_CHECKED'), 'REVIEW_RESERVATION')
        self.assertEqual(review_dispatch('OBSERVED', 'TERMINAL'), 'REVIEW_TERMINAL_EVIDENCE')
        self.assertEqual(review_dispatch('ATTEMPTING', 'PENDING'), 'CONTINUE_STATUS_RECONCILIATION')

    def test_money_bounds(self):
        for value in ('-1', '1.0', '01', '9223372036854775808', 100):
            with self.assertRaises(ValueError): amount(value)
        self.assertEqual(amount('9223372036854775807'), 9223372036854775807)
        self.assertEqual(amount('0', zero=True), 0)

    def test_journal_review(self):
        a = dict(posting_id='p1', account_id='a1', currency='UGX', side='DEBIT', amount_minor='100')
        b = dict(a, posting_id='p2', account_id='a2', side='CREDIT')
        result = review_journal([a,b])
        self.assertTrue(result['balanced'])
        self.assertFalse(result['correction_authorized'])
        self.assertFalse(review_journal([a,dict(b,amount_minor='99')])['balanced'])
        self.assertFalse(review_journal([a,dict(b,currency='USD')])['balanced'])
        with self.assertRaises(ValueError): review_journal([a,a])


if __name__ == '__main__': unittest.main()
