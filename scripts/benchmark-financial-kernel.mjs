// Synthetic workload equivalent to the Rust microbenchmark. No financial inputs.
import { majorToMinor, minorToMajor } from '../apps/api/dist/utils/money.js';
import { checkPayoutLimits } from '../apps/api/dist/services/payout-limits.js';
const count=100000;
const inputs=['0.01','1.20','99.99','1234.56','900000.01'];
const limits={max:100000000n,daily:1000000000n};
function run(i){
  const m=majorToMinor(inputs[i%inputs.length],'KES');
  minorToMajor(m,'KES');
  checkPayoutLimits(m,0n,limits);
  return m;
}
for(let i=0;i<10000;i++)run(i);
const start=process.hrtime.bigint();
let checksum=0n;
for(let i=0;i<count;i++)checksum+=run(i);
const elapsed=process.hrtime.bigint()-start;
console.log(JSON.stringify({runtime:'typescript',iterations:count,elapsed_ns:elapsed.toString(),checksum:checksum.toString()}));
