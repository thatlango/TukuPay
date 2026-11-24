// Local report reader; never accepts a path from an HTTP request.
import { open } from 'node:fs/promises';
const MAX_BYTES=32*1024*1024;
const MAX_DISPLAY=200;
const scopeKeys=['country','provider','currency','environment'];
const rowShape = (row,env) => row && typeof row==='object' && !Array.isArray(row)
  && row.environment===env && /^[A-Z]{2}$/.test(row.country) && /^[A-Z]{3}$/.test(row.currency)
  && /^[a-z][a-z0-9_-]{0,31}$/.test(row.provider);
export function summarizeIntelligence(report,env,now=Date.now()) {
  if(!['simulator','sandbox','production'].includes(env)||report?.schema_version!==1||report.decision!=='HUMAN_REVIEW_ONLY')
    throw new Error('Invalid report schema');
  const asOf=Date.parse(report.as_of);
  if(!Number.isFinite(asOf)||asOf>now)throw new Error('Invalid report timestamp');
  const groups={
    findings:report.findings,
    reconciliation:report.reconciliation_by_scope,
    liquidity:report.liquidity_baseline,
    funding:report.treasury?.funding??[],
    fees:report.treasury?.settlements??[],
    activity:report.activity_indicators?.scopes??[],
  };
  for(const list of Object.values(groups)){
    if(!Array.isArray(list)||list.length>100000||list.some(row=>!rowShape(row,env)))throw new Error('Report environment or row schema mismatch');
  }
  // Only allowlisted fields are forwarded to the HTML renderer.
  const pick=(rows,fields)=>rows.slice(0,MAX_DISPLAY).map(row=>Object.fromEntries([...scopeKeys,...fields].map(key=>{
    const value=row[key];if(value===null||value===undefined)return [key,null];
    if((typeof value!=='string'&&typeof value!=='number')||String(value).length>256)throw new Error('Invalid report field');
    return [key,value];
  })));
  return {asOf:report.as_of,environment:env,stale:now-asOf>24*3600*1000,
    statementComplete:report.statement_coverage_complete===true,
    counts:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),
    findings:pick(groups.findings,['kind','reference','code','severity']),
    reconciliation:pick(groups.reconciliation,['kind','matched_count','ambiguous_reference_count','matched_minor','observed_difference_minor']),
    liquidity:pick(groups.liquidity,['mean_daily_payout_minor','seven_day_payout_baseline_minor']),
    funding:pick(groups.funding,['disbursement_balance_minor','seven_day_obligations_minor','funding_gap_minor','evidence']),
    fees:pick(groups.fees,['reference','fee_difference_minor','net_difference_minor','status']),
    activity:pick(groups.activity,['kind','observed_count','peak_five_minute_count','terminal_unsuccessful_count']),
  };
}
export async function loadIntelligence(path,env) {
  if(!path)return null;
  const fd=await open(path,'r');
  try{
    const stat=await fd.stat();
    if(!stat.isFile()||stat.size>MAX_BYTES)throw new Error('Invalid report file');
    // Reject permissions accessible to other local users on POSIX hosts.
    if(process.platform!=='win32'&&(stat.mode&0o077)!==0)throw new Error('Report file permissions must be private');
    const data=Buffer.alloc(stat.size+1);
    let offset=0;
    while(offset<data.length){
      const {bytesRead}=await fd.read(data,offset,data.length-offset,offset);
      if(!bytesRead)break;
      offset+=bytesRead;
    }
    if(offset!==stat.size)throw new Error('Report changed during read');
    return summarizeIntelligence(JSON.parse(data.subarray(0,offset).toString('utf8')),env);
  }finally{await fd.close()}
}
