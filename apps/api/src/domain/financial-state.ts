import type { PaymentStatus } from './payments.js';
import type { PayoutStatus } from './payouts.js';

const collection: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['PENDING','FAILED','CANCELLED','EXPIRED'],
  PENDING: ['SUCCESSFUL','FAILED','CANCELLED','EXPIRED'],
  SUCCESSFUL: [], FAILED: [], CANCELLED: [], EXPIRED: [],
};
const payout: Record<PayoutStatus, readonly PayoutStatus[]> = {
  APPROVAL_REQUIRED: ['APPROVED','CANCELLED'],
  APPROVED: ['PENDING','CANCELLED'],
  PENDING: ['SUCCESSFUL','FAILED','CANCELLED'],
  SUCCESSFUL: [], FAILED: [], CANCELLED: [],
};
export function collectionTransition(from: PaymentStatus,to: PaymentStatus,verified: boolean): boolean {
  return from===to || (collection[from].includes(to) && (to!=='SUCCESSFUL'||verified));
}
export function payoutTransition(from: PayoutStatus,to: PayoutStatus,verified: boolean): boolean {
  return from===to || (payout[from].includes(to) && (to!=='SUCCESSFUL'||verified));
}
