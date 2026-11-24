/** Configuration validation; error messages never contain credential values. */
export function providerUrl(value: string, mode: 'sandbox'|'production', name: string): string {
  let url: URL;
  try { url=new URL(value); } catch { throw new Error('Invalid '+name); }
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||url.search||url.hash|| (url.protocol!=='https:' && !(mode==='sandbox'&&loopback&&url.protocol==='http:'))
    || (mode==='production'&&loopback)) throw new Error('Invalid '+name);
  return url.toString().replace(/\/$/,'');
}
export function providerMode(value: string|undefined, baseUrl: string): 'sandbox'|'production' {
  if(value!==undefined && value!=='sandbox'&&value!=='production') throw new Error('Invalid provider mode');
  const url=new URL(baseUrl);
  const nonproduction=/sandbox|uat/i.test(url.hostname);
  if(value==='production'&&nonproduction) throw new Error('Provider mode conflicts with endpoint');
  return value??(nonproduction?'sandbox':'production');
}
export function msisdnMode(value:string|undefined, fallback:'local'|'e164'): 'local'|'e164' {
  if(value===undefined)return fallback;
  if(value!=='local'&&value!=='e164')throw new Error('Invalid MSISDN mode');
  return value;
}
export function airtelVersion(value:string|undefined): number {
  if(value===undefined||value==='1')return 1;
  throw new Error('Unsupported Airtel API version');
}
export function operatorPath(value:string|undefined): string|undefined {
  if(value===undefined)return undefined;
  if(!/^\/[A-Za-z0-9/_-]+$/.test(value)||value.includes('//'))throw new Error('Invalid operator path');
  return value;
}

/** Bind the configured MTN target to the selected mode and market registry. */
export function mtnTargetEnvironment(mode:'sandbox'|'production',target:string,marketTarget:string|undefined):string {
  if(mode==='sandbox' ? target!=='sandbox' : !marketTarget||target!==marketTarget||target==='sandbox') {
    throw new Error('MTN target environment conflicts with configured mode or market');
  }
  return target;
}
