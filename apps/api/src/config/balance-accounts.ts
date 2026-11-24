/** Conservative balance capability; not proof of funds or operator connectivity. */
export function balanceAccounts(provider: 'mtn'|'airtel', simulator: boolean, balanceConfigured: boolean, payoutConfigured: boolean) {
  return { collection: balanceConfigured, disbursement: balanceConfigured && (simulator || (provider==='mtn' && payoutConfigured)) };
}
