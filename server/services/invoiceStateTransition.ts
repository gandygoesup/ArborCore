import { db } from '../db';
import { invoices, type InvoiceStatus } from '@shared/schema';
import { eq } from 'drizzle-orm';

const VALID_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'voided'],
  sent: ['viewed', 'partially_paid', 'paid', 'overdue', 'voided', 'disputed'],
  viewed: ['partially_paid', 'paid', 'overdue', 'voided', 'disputed'],
  partially_paid: ['paid', 'overdue', 'voided', 'disputed'],
  paid: ['refunded', 'disputed'],
  overdue: ['viewed', 'partially_paid', 'paid', 'voided', 'written_off', 'disputed'],
  voided: [],
  disputed: ['paid', 'refunded', 'written_off'],
  refunded: [],
  written_off: [],
};

export type InvoiceTransitionError = {
  success: false;
  error: string;
  currentStatus: InvoiceStatus;
  attemptedStatus: InvoiceStatus;
};

export type InvoiceTransitionSuccess = {
  success: true;
  previousStatus: InvoiceStatus;
  newStatus: InvoiceStatus;
};

export type InvoiceTransitionResult = InvoiceTransitionError | InvoiceTransitionSuccess;

export async function canTransitionInvoice(
  invoiceId: string,
  newStatus: InvoiceStatus
): Promise<{ allowed: boolean; currentStatus: InvoiceStatus | null; reason?: string }> {
  const [invoice] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!invoice) {
    return { allowed: false, currentStatus: null, reason: 'Invoice not found' };
  }

  const currentStatus = invoice.status as InvoiceStatus;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(newStatus)) {
    return {
      allowed: false,
      currentStatus,
      reason: `Cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowedTransitions.join(', ') || 'none'}`,
    };
  }

  return { allowed: true, currentStatus };
}

const PAYMENT_GATED_STATUSES: InvoiceStatus[] = ['paid', 'partially_paid'];

const MIN_WRITTEN_OFF_REASON_LENGTH = 10;

export async function transitionInvoice(
  invoiceId: string,
  newStatus: InvoiceStatus,
  additionalUpdates?: Partial<{
    sentAt: Date;
    viewedAt: Date;
    paidAt: Date;
    overdueAt: Date;
    voidedAt: Date;
    voidReason: string;
    writtenOffAt: Date;
    writtenOffReason: string;
    writtenOffBy: string;
    disputedAt: Date;
    stripeDisputeId: string;
    refundedAt: Date;
  }>,
  options?: { bypassPaymentGate?: boolean }
): Promise<InvoiceTransitionResult> {
  if (PAYMENT_GATED_STATUSES.includes(newStatus) && !options?.bypassPaymentGate) {
    return {
      success: false,
      error: `Cannot directly transition to '${newStatus}'. This status can only be set through payment processing.`,
      currentStatus: 'draft' as InvoiceStatus,
      attemptedStatus: newStatus,
    };
  }

  if (newStatus === 'written_off') {
    const reason = additionalUpdates?.writtenOffReason?.trim();
    if (!reason || reason.length < MIN_WRITTEN_OFF_REASON_LENGTH) {
      return {
        success: false,
        error: `Written-off reason is required and must be at least ${MIN_WRITTEN_OFF_REASON_LENGTH} characters.`,
        currentStatus: 'draft' as InvoiceStatus,
        attemptedStatus: newStatus,
      };
    }
    if (!additionalUpdates?.writtenOffBy) {
      return {
        success: false,
        error: 'Written-off by (user ID) is required for audit purposes.',
        currentStatus: 'draft' as InvoiceStatus,
        attemptedStatus: newStatus,
      };
    }
  }

  const check = await canTransitionInvoice(invoiceId, newStatus);

  if (!check.allowed) {
    return {
      success: false,
      error: check.reason || 'Transition not allowed',
      currentStatus: check.currentStatus as InvoiceStatus,
      attemptedStatus: newStatus,
    };
  }

  const previousStatus = check.currentStatus as InvoiceStatus;

  await db
    .update(invoices)
    .set({
      status: newStatus,
      updatedAt: new Date(),
      ...additionalUpdates,
    })
    .where(eq(invoices.id, invoiceId));

  return {
    success: true,
    previousStatus,
    newStatus,
  };
}

export async function transitionInvoiceViaPayment(
  invoiceId: string,
  newStatus: 'paid' | 'partially_paid',
  paidAt?: Date
): Promise<InvoiceTransitionResult> {
  return transitionInvoice(
    invoiceId,
    newStatus,
    newStatus === 'paid' ? { paidAt: paidAt || new Date() } : undefined,
    { bypassPaymentGate: true }
  );
}

export async function sendInvoice(invoiceId: string): Promise<InvoiceTransitionResult> {
  return transitionInvoice(invoiceId, 'sent', { sentAt: new Date() });
}

export async function voidInvoice(invoiceId: string, reason?: string): Promise<InvoiceTransitionResult> {
  return transitionInvoice(invoiceId, 'voided', {
    voidedAt: new Date(),
    voidReason: reason,
  });
}

export function getValidTransitions(currentStatus: InvoiceStatus): InvoiceStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}
