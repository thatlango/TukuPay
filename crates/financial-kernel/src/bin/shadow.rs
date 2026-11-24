//! Offline TSV shadow interface. No network or database. Each input line is
//! currency<TAB>major, output is OK<TAB>minor<TAB>canonical or ERROR.
use std::io::{self,BufRead,Write};
use tukupay_financial_kernel::{Currency,Money};

fn main() -> io::Result<()> {
    let stdin=io::stdin();
    let mut out=io::BufWriter::new(io::stdout().lock());
    for line in stdin.lock().lines() {
        let line=line?;
        if line.len()>256 { writeln!(out,"ERROR")?; continue; }
        let result=line.split_once('\t').and_then(|(c,a)|Currency::parse(c).ok().and_then(|c|Money::from_major(c,a).ok()));
        match result {
            Some(m)=>writeln!(out,"OK\t{}\t{}",m.minor(),m.major())?,
            None=>writeln!(out,"ERROR")?,
        };
    }
    out.flush()
}
