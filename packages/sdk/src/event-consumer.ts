import type { FinancialEvent, TukuPayClient } from './index.js';

export type DurableEventDisposition = 'processed' | 'already-processed' | 'deferred';
export type EventConsumerResult = { received: number; acknowledged: number; deferred: boolean };

/** One pull batch; the caller owns durable deduplication and the local transaction. */
export async function consumeFinancialEventsOnce(
  client: Pick<TukuPayClient, 'getFinancialEvents' | 'acknowledgeFinancialEvent'>,
  processDurably: (event: FinancialEvent) => Promise<DurableEventDisposition>,
): Promise<EventConsumerResult> {
  const batch = await client.getFinancialEvents();
  let acknowledged = 0;
  for (const event of batch.events) {
    const result = await processDurably(event);
    if (result === 'deferred') return { received: batch.events.length, acknowledged, deferred: true };
    if (result !== 'processed' && result !== 'already-processed') throw new Error('Invalid durable event disposition');
    // Acknowledge only after the caller reports its transaction has committed.
    const ack = await client.acknowledgeFinancialEvent(event.id);
    if (ack.id !== event.id || ack.acknowledged !== true) throw new Error('Invalid financial event acknowledgement');
    acknowledged++;
  }
  return { received: batch.events.length, acknowledged, deferred: false };
}
