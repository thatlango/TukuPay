/** One immutable environment per database. No automatic adoption of historical data. */
export type FinancialEnvironment = 'simulator' | 'sandbox' | 'production';
export function configuredEnvironment(env: NodeJS.ProcessEnv = process.env): FinancialEnvironment {
  const value=env.TUKUPAY_FINANCIAL_ENVIRONMENT;
  if(value!=='simulator'&&value!=='sandbox'&&value!=='production') throw new Error('Explicit TUKUPAY_FINANCIAL_ENVIRONMENT is required');
  const simulated=(env.TUKUPAY_SIMULATOR_ENABLED??'false').toLowerCase()==='true';
  if(simulated!==(value==='simulator')) throw new Error('Simulator flag conflicts with financial environment');
  if(value!=='production'&&env.TUKUPAY_LIVE_PAYOUTS_ENABLED==='true') throw new Error('Live payout flag conflicts with non-production environment');
  return value;
}
export function verifyBinding(expected: FinancialEnvironment, rows: {environment:string}[]): void {
  if(rows.length!==1||rows[0]?.environment!==expected) throw new Error('Database environment is not bound to this runtime');
}
export function verifyOperatorMode(expected: FinancialEnvironment, mode: 'sandbox'|'production'): void {
  if(expected==='simulator'||expected!==mode) throw new Error('Operator mode conflicts with database financial environment');
}
