//! Synthetic CPU microbenchmark. No financial inputs, database, or network.
use std::{hint::black_box,time::Instant};
use tukupay_financial_kernel::{Currency,Money,validate_payout,PayoutLimits};
fn main() {
    let count=100_000_u64;
    let c=Currency::parse("KES").unwrap();
    let inputs=["0.01","1.20","99.99","1234.56","900000.01"];
    let limits=PayoutLimits{maximum_minor:100_000_000,daily_minor:1_000_000_000};
    // Warm up the same synthetic workload. Exclude initialization and output.
    for i in 0..10_000_usize {
        let m=Money::from_major(c,black_box(inputs[i%inputs.len()])).unwrap();
        black_box(m.major());
        black_box(validate_payout(m,0,limits).is_ok());
    }
    let start=Instant::now();
    let mut checksum=0_i128;
    for i in 0..count {
        let m=Money::from_major(c,black_box(inputs[i as usize%inputs.len()])).unwrap();
        black_box(m.major());
        black_box(validate_payout(m,0,limits).is_ok());
        checksum+=i128::from(m.minor());
    }
    let elapsed=start.elapsed();
    println!("{{\"runtime\":\"rust\",\"iterations\":{},\"elapsed_ns\":{},\"checksum\":\"{}\"}}",count,elapsed.as_nanos(),checksum);
}
