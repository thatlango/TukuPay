#![forbid(unsafe_code)]
//! Pure, deterministic rules. No database, network, keys, or payment dispatch.
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleError { Currency, Amount, Precision, Overflow, Limits, Journal, Transition }
impl fmt::Display for RuleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { write!(f, "{self:?}") }
}
impl std::error::Error for RuleError {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Currency([u8; 3]);
impl Currency {
    pub fn parse(code: &str) -> Result<Self, RuleError> {
        let upper = code.to_ascii_uppercase();
        let bytes = upper.as_bytes();
        let allowed = ["BIF","CDF","EUR","GHS","GNF","KES","LRD","MGA","MWK","NGN","RWF","SCR","SSP","SZL","TZS","UGX","USD","XAF","XOF","ZAR","ZMW"];
        if !allowed.contains(&upper.as_str()) { return Err(RuleError::Currency); }
        Ok(Self([bytes[0],bytes[1],bytes[2]]))
    }
    pub fn exponent(self) -> u32 {
        match &self.0 {
            b"BIF"|b"GNF"|b"RWF"|b"UGX"|b"XAF"|b"XOF" => 0,
            _ => 2,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Money { currency: Currency, minor: i64 }
impl Money {
    pub fn from_minor(currency: Currency, minor: i64) -> Result<Self, RuleError> {
        if minor <= 0 { return Err(RuleError::Amount); }
        Ok(Self { currency, minor })
    }
    pub fn from_major(currency: Currency, amount: &str) -> Result<Self, RuleError> {
        let amount = amount.trim();
        let (whole, frac) = amount.split_once('.').unwrap_or((amount, ""));
        if whole.is_empty() || !whole.bytes().all(|b| b.is_ascii_digit())
            || (amount.contains('.') && (frac.is_empty() || !frac.bytes().all(|b| b.is_ascii_digit()))) {
            return Err(RuleError::Amount);
        }
        let exponent = currency.exponent();
        if frac.len() > exponent as usize { return Err(RuleError::Precision); }
        let whole: i64 = whole.parse().map_err(|_| RuleError::Overflow)?;
        let fraction: i64 = if frac.is_empty() { 0 } else { frac.parse().map_err(|_| RuleError::Overflow)? };
        let scaled = whole.checked_mul(10_i64.pow(exponent)).ok_or(RuleError::Overflow)?;
        let fraction = fraction.checked_mul(10_i64.pow(exponent - frac.len() as u32)).ok_or(RuleError::Overflow)?;
        Self::from_minor(currency, scaled.checked_add(fraction).ok_or(RuleError::Overflow)?)
    }
    pub fn minor(self) -> i64 { self.minor }
    pub fn currency(self) -> Currency { self.currency }
    pub fn major(self) -> String {
        let exp = self.currency.exponent();
        if exp == 0 { return self.minor.to_string(); }
        let scale = 10_i64.pow(exp);
        let fraction = format!("{:0width$}", self.minor % scale, width=exp as usize);
        let fraction = fraction.trim_end_matches('0');
        if fraction.is_empty() { (self.minor / scale).to_string() }
        else { format!("{}.{}", self.minor / scale, fraction) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PayoutLimits { pub maximum_minor: i64, pub daily_minor: i64 }
pub fn validate_payout(amount: Money, reserved_minor: i64, limits: PayoutLimits) -> Result<(), RuleError> {
    if reserved_minor < 0 || limits.maximum_minor <= 0 || limits.daily_minor < limits.maximum_minor
        || amount.minor() > limits.maximum_minor
        || i128::from(reserved_minor) + i128::from(amount.minor()) > i128::from(limits.daily_minor) {
        return Err(RuleError::Limits);
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side { Debit, Credit }
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Posting<'a> { pub account: &'a str, pub side: Side, pub money: Money }
/// Validates a single-currency, positive, balanced journal. Optional expected total
/// binds the journal to the original financial intent.
pub fn validate_journal(currency: Currency, postings: &[Posting<'_>], expected: Option<Money>) -> Result<(), RuleError> {
    if postings.len() < 2 || postings.len() > 10_000 { return Err(RuleError::Journal); }
    let (mut debit, mut credit) = (0_i128, 0_i128);
    for p in postings {
        if p.account.trim().is_empty() || p.money.currency() != currency { return Err(RuleError::Journal); }
        match p.side { Side::Debit => debit += i128::from(p.money.minor()), Side::Credit => credit += i128::from(p.money.minor()) }
    }
    if debit == 0 || debit != credit { return Err(RuleError::Journal); }
    if let Some(value) = expected {
        if value.currency() != currency || i128::from(value.minor()) != debit { return Err(RuleError::Journal); }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollectionState { Created, Pending, Successful, Failed, Cancelled, Expired }
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PayoutState { ApprovalRequired, Approved, Pending, Successful, Failed, Cancelled }
/// Strict target policy, not current TypeScript parity: terminal states require
/// a separately governed correction workflow, and success requires evidence.
pub fn collection_transition(from: CollectionState, to: CollectionState, verified: bool) -> Result<(), RuleError> {
    use CollectionState::*;
    if from == to { return Ok(()); }
    if to == Successful && !verified { return Err(RuleError::Transition); }
    if matches!((from,to), (Created,Pending|Failed|Cancelled|Expired)|(Pending,Successful|Failed|Cancelled|Expired)) { Ok(()) }
    else { Err(RuleError::Transition) }
}
pub fn payout_transition(from: PayoutState, to: PayoutState, verified: bool) -> Result<(), RuleError> {
    use PayoutState::*;
    if from == to { return Ok(()); }
    if to == Successful && !verified { return Err(RuleError::Transition); }
    if matches!((from,to),(ApprovalRequired,Approved|Cancelled)|(Approved,Pending|Cancelled)|(Pending,Successful|Failed|Cancelled)) { Ok(()) }
    else { Err(RuleError::Transition) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn shared_money_vectors() {
        for line in include_str!("../../../contracts/financial/money.tsv").lines().skip(1) {
            let f: Vec<_> = line.split('\t').collect();
            let actual = Currency::parse(f[0]).and_then(|c| Money::from_major(c,f[1]));
            if f[2] == "ok" { let m=actual.unwrap(); assert_eq!(m.minor().to_string(),f[3]); assert_eq!(m.major(),f[4]); }
            else { assert!(actual.is_err(), "{line}"); }
        }
    }
    #[test] fn shared_limits_vectors() {
        for line in include_str!("../../../contracts/financial/limits.tsv").lines().skip(1) {
            let f: Vec<_> = line.split('\t').collect();
            let actual = Money::from_minor(Currency::parse("UGX").unwrap(),f[0].parse().unwrap())
                .and_then(|m|validate_payout(m,f[1].parse().unwrap(),PayoutLimits{maximum_minor:f[2].parse().unwrap(),daily_minor:f[3].parse().unwrap()}));
            assert_eq!(actual.is_ok(), f[4]=="allow", "{line}");
        }
    }
    #[test] fn bounded_money_roundtrip() {
        for currency in ["UGX","KES","EUR","XOF","USD"] {
            let c=Currency::parse(currency).unwrap();
            for minor in [1,9,10,99,100,101,10_000,1_000_000,i64::MAX] {
                let m=Money::from_minor(c,minor).unwrap();
                assert_eq!(Money::from_major(c,&m.major()),Ok(m));
            }
        }
        assert!(Currency::parse("ZZZ").is_err());
        assert!(Money::from_major(Currency::parse("UGX").unwrap(),"9223372036854775808").is_err());
        assert!(Money::from_major(Currency::parse("KES").unwrap(),"92233720368547758.08").is_err());
        assert!(Money::from_major(Currency::parse("KES").unwrap(),"1.").is_err());
    }
    #[test] fn journal_rejects_unbalanced_or_empty_accounts() {
        let c=Currency::parse("UGX").unwrap();
        let a=Money::from_minor(c,100).unwrap();
        let b=Money::from_minor(c,99).unwrap();
        assert!(validate_journal(c,&[
            Posting{account:"clearing",side:Side::Debit,money:a},
            Posting{account:"customer",side:Side::Credit,money:b},
        ],None).is_err());
        assert!(validate_journal(c,&[
            Posting{account:" ",side:Side::Debit,money:a},
            Posting{account:"customer",side:Side::Credit,money:a},
        ],None).is_err());
        assert!(validate_payout(a,i64::MAX,PayoutLimits{maximum_minor:100,daily_minor:i64::MAX}).is_err());
    }
    #[test] fn journals_and_states() {
        let c=Currency::parse("UGX").unwrap();
        let m=Money::from_minor(c,100).unwrap();
        let p=[Posting{account:"clearing",side:Side::Debit,money:m},Posting{account:"customer",side:Side::Credit,money:m}];
        assert!(validate_journal(c,&p,Some(m)).is_ok());
        assert!(validate_journal(c,&p[..1],Some(m)).is_err());
        assert!(validate_journal(c,&p,Some(Money::from_minor(c,101).unwrap())).is_err());
        assert!(validate_journal(Currency::parse("USD").unwrap(),&p,None).is_err());
        assert!(collection_transition(CollectionState::Pending,CollectionState::Successful,false).is_err());
        assert!(collection_transition(CollectionState::Pending,CollectionState::Successful,true).is_ok());
        assert!(collection_transition(CollectionState::Successful,CollectionState::Pending,true).is_err());
        assert!(payout_transition(PayoutState::ApprovalRequired,PayoutState::Pending,false).is_err());
        assert!(payout_transition(PayoutState::Approved,PayoutState::Pending,false).is_ok());
    }
}
