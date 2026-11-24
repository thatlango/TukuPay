//! Read-only journal audit for bounded normalized TSV snapshots.
//! No financial writes and no inference of production environment.
use std::collections::BTreeMap;
use crate::{Currency, Money, Posting, Side, validate_journal};

const HEADER:&str="journal_id\tjournal_currency\texpected_minor\tposting_id\taccount_id\taccount_currency\tside\tamount_minor";
#[derive(Debug,PartialEq,Eq)]
pub struct AuditResult { pub journals:usize, pub failed:Vec<String> }
#[derive(Debug)]
struct Row<'a>{posting:&'a str,account:&'a str,currency:&'a str,side:&'a str,amount:&'a str}
fn id(v:&str)->bool { !v.is_empty()&&v.len()<=128&&v.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_') }
pub fn audit_tsv(input:&str)->Result<AuditResult,&'static str>{
    if input.len()>32*1024*1024{return Err("snapshot too large")}
    let mut lines=input.lines();
    if lines.next()!=Some(HEADER){return Err("invalid header")}
    let mut groups:BTreeMap<&str,Vec<(&str,&str,Row<'_>)>>=BTreeMap::new();
    let mut count=0;
    for line in lines{
        count+=1;
        if count>100_000||line.len()>1024{return Err("row limit exceeded")}
        let f:Vec<_>=line.split('\t').collect();
        if f.len()!=8||!id(f[0]){return Err("invalid row")}
        groups.entry(f[0]).or_default().push((f[1],f[2],Row{posting:f[3],account:f[4],currency:f[5],side:f[6],amount:f[7]}));
    }
    let mut failed=Vec::new();
    for (journal,rows) in &groups{
        let check=(||{
            let (currency,expected,_)=rows.first()?;
            let c=Currency::parse(currency).ok()?;
            let expected_money=if *expected=="-" {None} else {Some(Money::from_minor(c,expected.parse().ok()?).ok()?)};
            let mut postings=Vec::new();
            let mut ids=std::collections::BTreeSet::new();
            for (curr,exp,row) in rows{
                if curr!=currency||exp!=expected||!id(row.posting)||!ids.insert(row.posting)||!id(row.account){return None}
                let pc=Currency::parse(row.currency).ok()?;
                let m=Money::from_minor(pc,row.amount.parse().ok()?).ok()?;
                let side=match row.side {"DEBIT"=>Side::Debit,"CREDIT"=>Side::Credit,_=>return None};
                postings.push(Posting{account:row.account,side,money:m});
            }
            validate_journal(c,&postings,expected_money).ok()
        })();
        if check.is_none(){failed.push((*journal).to_string())}
    }
    Ok(AuditResult{journals:groups.len(),failed})
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test] fn balanced_and_mismatched(){
        let input=format!("{HEADER}\nj1\tUGX\t100\tp1\ta1\tUGX\tDEBIT\t100\nj1\tUGX\t100\tp2\ta2\tUGX\tCREDIT\t100\nj2\tUGX\t100\tp3\ta1\tUGX\tDEBIT\t100\nj2\tUGX\t100\tp4\ta2\tUGX\tCREDIT\t99\n");
        let result=audit_tsv(&input).unwrap();
        assert_eq!(result.journals,2);assert_eq!(result.failed,vec!["j2"]);
    }
    #[test] fn duplicate_and_currency_mismatch(){
        let input=format!("{HEADER}\nj1\tUGX\t100\tp1\ta1\tUGX\tDEBIT\t100\nj1\tUGX\t100\tp1\ta2\tUGX\tCREDIT\t100\nj2\tUGX\t100\tp3\ta1\tUSD\tDEBIT\t100\nj2\tUGX\t100\tp4\ta2\tUGX\tCREDIT\t100");
        assert_eq!(audit_tsv(&input).unwrap().failed,vec!["j1","j2"]);
        assert!(audit_tsv("wrong header").is_err());
    }
}
