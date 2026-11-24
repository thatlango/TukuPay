import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { TukuPayClient } from '../packages/sdk/dist/index.js';

const baseUrl = process.env.TUKUPAY_OPS_API_URL;
const token = process.env.TUKUPAY_OPS_TOKEN;
if (!baseUrl || !token) throw new Error('Set TUKUPAY_OPS_API_URL and a dedicated ops credential on this trusted workstation');
const client = new TukuPayClient({ baseUrl, token, product: 'finance' });
const csrf = randomBytes(32).toString('hex');
const port = Number(process.env.TUKUPAY_OPS_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid workspace port');
const origin = 'http://127.0.0.1:' + port;
const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows = (data, keys) => data.map(row => '<tr>' + keys.map(k => '<td>'+esc(row[k])+'</td>').join('') + '</tr>').join('');
const table = (headers, body) => '<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
const section = (title, body) => '<section><h2>'+esc(title)+'</h2>'+body+'</section>';
function render(summary, capabilities, exceptions, transport, notice) {
  const ops = summary.ops;
  const cards = [
    ['Pending collections', ops.pendingAging?.pending],
    ['Over 30 minutes', ops.pendingAging?.over_30m],
    ['Exceptions displayed', exceptions.exceptions.length],
    ['Transport series', transport.metrics.length],
  ].map(([label,value])=>'<article><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></article>').join('');
  const amounts = [
    ...((ops.payments24hByCurrency ?? []).map(r=>({...r,kind:'Collection'}))),
    ...((ops.payouts24hByCurrency ?? []).map(r=>({...r,kind:'Payout'}))),
  ];
  const rails = capabilities.markets.flatMap(m=>m.providers.map(p=>({country:m.country,provider:p.provider,environment:p.environment,collection:p.collection.available?'Available':'Disabled',payout:p.payout.available?'Available':'Disabled',callback:p.callbacks})));
  const reviewRows = exceptions.exceptions.map(row=>{
    const states = ['OPEN','INVESTIGATING','ESCALATED','REVIEWED'].map(state=>'<option'+(state===(row.review_state??'OPEN')?' selected':'')+'>'+state+'</option>').join('');
    const form = '<form method="post" action="/review"><input type="hidden" name="csrf" value="'+esc(csrf)+'"><input type="hidden" name="id" value="'+esc(row.id)+'"><input type="hidden" name="kind" value="'+esc(row.kind)+'"><input type="hidden" name="version" value="'+esc(row.review_version)+'"><label>State<select name="state">'+states+'</select></label><label>Assignee<input name="assignedTo" maxlength="100" value="'+esc(row.assigned_to??'')+'"></label><label>Review note<textarea required name="note" maxlength="1000" placeholder="No customer or credential data"></textarea></label><button>Save review</button></form>';
    return '<tr><td>'+esc(row.kind)+'<small>'+esc(row.id)+'</small></td><td>'+esc(row.product_code)+' / '+esc(row.country_code)+' / '+esc(row.provider_code)+'</td><td>'+esc(row.status)+'<small>'+esc(row.reason)+'</small></td><td>'+esc(row.attempts)+'</td><td>'+esc(row.created_at)+'</td><td>'+form+'</td></tr>';
  }).join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TukuPay Operations</title><style>body{margin:0;background:#f6f7f8;color:#18232b;font:14px system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:28px}h1{font-size:26px;margin:0 0 8px}h2{font-size:17px}small{display:block;color:#52616b;overflow-wrap:anywhere}header{display:flex;justify-content:space-between;gap:16px;align-items:center}a{color:#18675c}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}article,section{background:white;border:1px solid #dce3e6;border-radius:12px;padding:16px;margin:12px 0}strong{display:block;font-size:28px;margin-top:8px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:10px;border-bottom:1px solid #e8ecef;vertical-align:top}th{color:#52616b;font-size:12px}td{max-width:330px}form{display:grid;gap:6px;min-width:200px}label{font-size:12px}input,select,textarea,button{box-sizing:border-box;width:100%;font:inherit;border:1px solid #ccd5db;border-radius:6px;padding:7px}button{background:#145d52;color:white;border:0;cursor:pointer}.notice{padding:12px;background:#eef1f2;border-radius:8px}footer{color:#52616b;font-size:12px}</style><main><header><div><h1>TukuPay Operations</h1><p>'+esc(capabilities.simulator?'SIMULATOR — no real money':'OPERATOR — read and review only')+' · '+esc(ops.generatedAt)+'</p></div><a href="/">Refresh snapshot</a></header>'+(notice?'<p class="notice">'+esc(notice)+'</p>':'')+'<div class="cards">'+cards+'</div>'+
    section('Exception workspace', '<p>Review does not change financial status. An unresolved transaction stays visible after review.</p>'+table(['Transaction','Product / rail','Status / reason','Attempts','Created','Review'],reviewRows||'<tr><td colspan="6">No exceptions returned.</td></tr>'))+
    section('24-hour activity by currency',table(['Kind','Currency','Status','Count','Amount (minor units)'],rows(amounts,['kind','currency','status','count','amount_minor'])))+
    section('Provider capabilities',table(['Country','Rail','Environment','Collection','Payout','Callbacks'],rows(rails,['country','provider','environment','collection','payout','callback'])))+
    section('Provider transport — process-local',table(['Provider','Country','Operation','Requests','HTTP errors','Timeouts','Retries','Average ms'],rows(transport.metrics,['provider','country','operation','requests','httpErrors','timeouts','retries','averageDurationMs'])))+
    section('Candidate rails',table(['Provider','Initial market','Stage'],rows(capabilities.candidates,['provider','initialCountry','contractStage'])))+
    '<footer>Local operator workspace. No credential is sent to the browser. Currency amounts are not aggregated across currencies. Availability flags do not establish certification.</footer></main></html>';
}
async function readBody(req) {
  let result = '';
  for await (const chunk of req) { result += chunk; if (result.length > 8192) throw new Error('Request too large'); }
  return new URLSearchParams(result);
}
const server = createServer(async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if (req.headers.host !== '127.0.0.1:'+port) { res.writeHead(403).end(); return; }
  let notice = '';
  try {
    if (req.method === 'POST' && req.url === '/review') {
      if (req.headers.origin !== origin || !String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) { res.writeHead(403).end(); return; }
      const form = await readBody(req);
      if (form.get('csrf') !== csrf) { res.writeHead(403).end(); return; }
      try {
        await client.reviewException({kind:form.get('kind'),id:form.get('id'),state:form.get('state'),assignedTo:form.get('assignedTo')||null,note:form.get('note'),expectedVersion:Number(form.get('version'))});
        res.writeHead(303,{Location:'/?reviewed=1'}).end();return;
      } catch { notice = 'Review was rejected. Check permissions, reload current version and try again.'; }
    } else if (req.method !== 'GET' || !['/','/?reviewed=1'].includes(req.url)) { res.writeHead(404).end();return; }
    if (req.url === '/?reviewed=1') notice = 'Review saved.';
    const [summary,capabilities,exceptions,transport] = await Promise.all([client.getOpsSummary(),client.getCapabilities(),client.getExceptions(100),client.getProviderTransport()]);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(render(summary,capabilities,exceptions,transport,notice));
  } catch { res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'}).end('Unable to load TukuPay operations. Check API connectivity and scoped authorization.'); }
});
server.listen(port,'127.0.0.1',()=>console.log('TukuPay local operations: '+origin));
