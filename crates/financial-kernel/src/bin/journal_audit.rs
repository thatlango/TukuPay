use std::io::{self,Read};
use tukupay_financial_kernel::journal_audit::audit_tsv;
fn main(){
    let mut input=String::new();
    if io::stdin().take(32*1024*1024+1).read_to_string(&mut input).is_err(){eprintln!("Invalid audit input");std::process::exit(2)}
    match audit_tsv(&input){
        Err(e)=>{eprintln!("Invalid audit input: {e}");std::process::exit(2)},
        Ok(result)=>{
            println!("journals_checked={}",result.journals);
            println!("journals_failed={}",result.failed.len());
            for id in &result.failed{println!("REVIEW\t{id}")}
            if !result.failed.is_empty(){std::process::exit(1)}
        }
    }
}
