import Stripe from 'stripe';
import { db } from './db';
import {
  invoices,
  payments,
  invoiceAllocations,
  stripeEvents,
  paymentPlans,
  auditLogs,
  jobs,
  type PaymentPlanScheduleItem,
} from '@shared/schema';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
import { getStripe } from './stripeClient';

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
    stripeAccountId: string
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error('Stripe webhook payload must be raw Buffer');
    }

    const stripe = getStripe();

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // ---------- EXTRACT STRIPE ACCOUNT ID ----------
    // For Stripe Connect, event.account contains the connected account ID
    // For direct (non-Connect) integration, this is undefined (uses platform's account)
    // 
    // ARCHITECTURE NOTE: This implementation supports both scenarios:
    // - Connect: event.account is set, and we filter invoices by stripeAccountId
    // - Direct: event.account is undefined, no additional filtering (single account anyway)
    //
    // Multi-tenancy is enforced at the invoice level via companyId. The stripeAccountId
    // filter is an additional safeguard for Connect scenarios.
    const eventStripeAccountId = (event as any).account as string | undefined;

    // ---------- IDEMPOTENCY CHECK (READ-ONLY) ----------
    const [existing] = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, event.id));

    if (existing) {
      // Already processed, safe to skip
      return;
    }

    // ---------- PROCESS WITHIN TRANSACTION ----------
    // Event is marked as processed AFTER successful business logic
    await db.transaction(async (tx) => {
      // Try to insert - if conflict, another process got there first
      const inserted = await tx
        .insert(stripeEvents)
        .values({
          id: event.id,
          eventType: event.type,
          payload: event,
        })
        .onConflictDoNothing({ target: stripeEvents.id })
        .returning();

      if (inserted.length === 0) {
        // Race condition - another process handled this event
        return;
      }

      // ---------- ROUTING (INSIDE TRANSACTION) ----------
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
            eventStripeAccountId,
            tx
          );
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(
            event.data.object as Stripe.PaymentIntent,
            eventStripeAccountId,
            tx
          );
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(
            event.data.object as Stripe.Charge,
            eventStripeAccountId,
            tx
          );
          break;

        case 'charge.dispute.created':
          await this.handleDisputeCreated(
            event.data.object as Stripe.Dispute,
            eventStripeAccountId,
            tx
          );
          break;

        case 'charge.dispute.closed':
          await this.handleDisputeClosed(
            event.data.object as Stripe.Dispute,
            eventStripeAccountId,
            tx
          );
          break;
      }
    });
  }

  /* ======================================================
     CHECKOUT SESSION → PAYMENT → ALLOCATION
  ====================================================== */
  private static async handleCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
    stripeAccountId: string | undefined,
    tx: any
  ) {
    if (!session.payment_intent) return;

    // Check if this is a payment plan installment payment
    const metadata = session.metadata || {};
    if (metadata.type === 'payment_plan_installment' && metadata.paymentPlanId && metadata.scheduleItemId) {
      await this.handlePaymentPlanInstallmentPayment(session, tx);
      return;
    }

    // Build query with stripeAccountId filtering if available
    const conditions = [eq(invoices.stripeCheckoutSessionId, session.id)];
    if (stripeAccountId) {
      conditions.push(eq(invoices.stripeAccountId, stripeAccountId));
    }

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(...conditions));

    if (!invoice) return;
    if (invoice.status === 'paid' || invoice.status === 'voided' || invoice.status === 'disputed') return;

    const amount = (session.amount_total ?? 0) / 100;

    await this.recordStripePaymentInTx(tx, {
      paymentIntentId: session.payment_intent.toString(),
      chargeId: null,
      amount,
      invoiceId: invoice.id,
      companyId: invoice.companyId,
    });
  }

  /* ======================================================
     PAYMENT PLAN INSTALLMENT PAYMENT
  ====================================================== */
  private static async handlePaymentPlanInstallmentPayment(
    session: Stripe.Checkout.Session,
    tx: any
  ) {
    const metadata = session.metadata!;
    const paymentPlanId = metadata.paymentPlanId;
    const scheduleItemId = metadata.scheduleItemId;
    const amount = (session.amount_total ?? 0) / 100;

    const [plan] = await tx
      .select()
      .from(paymentPlans)
      .where(eq(paymentPlans.id, paymentPlanId));

    if (!plan) {
      console.error(`Payment plan not found for webhook: ${paymentPlanId}`);
      return;
    }

    // Update the schedule item to paid
    const schedule = (plan.schedule || []) as PaymentPlanScheduleItem[];
    const updatedSchedule = schedule.map(item => {
      if (item.id === scheduleItemId) {
        return {
          ...item,
          status: 'paid' as const,
          paidAt: new Date().toISOString(),
          stripePaymentIntentId: session.payment_intent?.toString() || null,
        };
      }
      return item;
    });

    // Calculate new totals
    const newAmountPaid = parseFloat(plan.amountPaid) + amount;
    const newAmountDue = parseFloat(plan.totalAmount) - newAmountPaid;
    const allPaid = updatedSchedule.every(item => item.status === 'paid');

    await tx
      .update(paymentPlans)
      .set({
        schedule: updatedSchedule,
        amountPaid: newAmountPaid.toFixed(2),
        amountDue: newAmountDue.toFixed(2),
        status: allPaid ? 'completed' : plan.status,
        updatedAt: new Date(),
      })
      .where(eq(paymentPlans.id, paymentPlanId));

    // Create audit log
    await tx.insert(auditLogs).values({
      companyId: plan.companyId,
      action: 'payment_plan.installment_paid',
      entityType: 'payment_plan',
      entityId: paymentPlanId,
      newState: {
        scheduleItemId,
        amount,
        newAmountPaid,
        newAmountDue,
        checkoutSessionId: session.id,
        paymentIntentId: session.payment_intent?.toString(),
      },
    });
  }

  /* ======================================================
     PAYMENT INTENT SUCCEEDED (SAFETY NET)
  ====================================================== */
  private static async handlePaymentIntentSucceeded(
    intent: Stripe.PaymentIntent,
    stripeAccountId: string | undefined,
    tx: any
  ) {
    // Build query with stripeAccountId filtering if available
    const conditions = [eq(invoices.stripePaymentIntentId, intent.id)];
    if (stripeAccountId) {
      conditions.push(eq(invoices.stripeAccountId, stripeAccountId));
    }

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(...conditions));

    if (!invoice) return;
    if (invoice.status === 'paid' || invoice.status === 'voided' || invoice.status === 'disputed') return;

    const amount = intent.amount_received / 100;
    const chargeId = intent.latest_charge?.toString() ?? null;

    await this.recordStripePaymentInTx(tx, {
      paymentIntentId: intent.id,
      chargeId,
      amount,
      invoiceId: invoice.id,
      companyId: invoice.companyId,
    });
  }

  /* ======================================================
     REFUNDS (PAYMENT-LEVEL + INVOICE STATUS)
  ====================================================== */
  private static async handleChargeRefunded(
    charge: Stripe.Charge,
    stripeAccountId: string | undefined,
    tx: any
  ) {
    const refundAmount = (charge.amount_refunded ?? 0) / 100;
    const originalAmount = (charge.amount ?? 0) / 100;
    const isFullRefund = refundAmount >= originalAmount;

    // Update payment record
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripeChargeId, charge.id));

    if (payment) {
      await tx
        .update(payments)
        .set({
          status: isFullRefund ? 'refunded' : 'completed',
          refundedAmount: refundAmount.toFixed(2),
          refundedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      // If full refund, update invoice status
      if (isFullRefund && payment.invoiceId) {
        // Build query with stripeAccountId filtering if available
        const conditions = [eq(invoices.id, payment.invoiceId)];
        if (stripeAccountId) {
          conditions.push(eq(invoices.stripeAccountId, stripeAccountId));
        }

        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(and(...conditions));

        if (invoice && invoice.status === 'paid') {
          await tx
            .update(invoices)
            .set({
              status: 'refunded',
              refundedAt: new Date(),
            })
            .where(eq(invoices.id, payment.invoiceId));

          // DEPOSIT GATING REVERSAL: Re-lock scheduling when deposit is refunded
          if (invoice.invoiceType === 'deposit' && invoice.jobId) {
            await tx
              .update(jobs)
              .set({
                depositPaid: false,
                updatedAt: new Date(),
              })
              .where(eq(jobs.id, invoice.jobId));

            await tx.insert(auditLogs).values({
              companyId: invoice.companyId,
              action: 'job.deposit_refunded',
              entityType: 'job',
              entityId: invoice.jobId,
              newState: {
                depositPaid: false,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                refundAmount: refundAmount,
              },
            });
          }
        }
      }
    }
  }

  /* ======================================================
     DISPUTE CREATED → HALT WORKFLOWS
  ====================================================== */
  private static async handleDisputeCreated(
    dispute: Stripe.Dispute,
    stripeAccountId: string | undefined,
    tx: any
  ) {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    if (!chargeId) return;

    // Find invoice via payment with this charge
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripeChargeId, chargeId));

    if (!payment?.invoiceId) return;

    // Verify invoice belongs to correct Stripe account if Connect is used
    if (stripeAccountId) {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.id, payment.invoiceId),
          eq(invoices.stripeAccountId, stripeAccountId)
        ));
      if (!invoice) return; // Invoice doesn't match this Stripe account
    }

    // First fetch the invoice to check if it's a deposit
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, payment.invoiceId));

    if (!invoice) return;

    await tx
      .update(invoices)
      .set({
        status: 'disputed',
        disputedAt: new Date(),
        stripeDisputeId: dispute.id,
      })
      .where(eq(invoices.id, payment.invoiceId));

    // DEPOSIT GATING REVERSAL: Lock scheduling when deposit is disputed
    if (invoice.invoiceType === 'deposit' && invoice.jobId) {
      await tx
        .update(jobs)
        .set({
          depositPaid: false,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, invoice.jobId));

      await tx.insert(auditLogs).values({
        companyId: invoice.companyId,
        action: 'job.deposit_disputed',
        entityType: 'job',
        entityId: invoice.jobId,
        newState: {
          depositPaid: false,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          disputeId: dispute.id,
        },
      });
    }
  }

  /* ======================================================
     DISPUTE CLOSED → RESOLVE BASED ON OUTCOME
  ====================================================== */
  private static async handleDisputeClosed(
    dispute: Stripe.Dispute,
    stripeAccountId: string | undefined,
    tx: any
  ) {
    // Build query with stripeAccountId filtering if available
    const conditions = [eq(invoices.stripeDisputeId, dispute.id)];
    if (stripeAccountId) {
      conditions.push(eq(invoices.stripeAccountId, stripeAccountId));
    }

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(...conditions));

    if (!invoice) return;

    // Outcome determines new status
    // won: dispute resolved in merchant's favor → back to paid
    // lost: dispute resolved in customer's favor → refunded
    // warning_closed: warning resolved → back to paid
    const newStatus =
      dispute.status === 'won' ? 'paid' :
      dispute.status === 'lost' ? 'refunded' :
      dispute.status === 'warning_closed' ? 'paid' :
      'paid'; // default fallback for other closed statuses

    await tx
      .update(invoices)
      .set({
        status: newStatus,
        refundedAt: newStatus === 'refunded' ? new Date() : null,
      })
      .where(eq(invoices.id, invoice.id));

    // DEPOSIT GATING: Update job based on dispute outcome
    if (invoice.invoiceType === 'deposit' && invoice.jobId) {
      // If dispute was won (merchant wins), restore depositPaid
      // If dispute was lost (refunded), keep depositPaid false
      const shouldBeUnlocked = newStatus === 'paid';

      await tx
        .update(jobs)
        .set({
          depositPaid: shouldBeUnlocked,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, invoice.jobId));

      await tx.insert(auditLogs).values({
        companyId: invoice.companyId,
        action: shouldBeUnlocked ? 'job.deposit_dispute_won' : 'job.deposit_dispute_lost',
        entityType: 'job',
        entityId: invoice.jobId,
        newState: {
          depositPaid: shouldBeUnlocked,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          disputeId: dispute.id,
          disputeOutcome: dispute.status,
        },
      });
    }
  }

  /* ======================================================
     PAYMENT + ALLOCATION (LEDGER TRUTH) - WITHIN TRANSACTION
  ====================================================== */
  private static async recordStripePaymentInTx(
    tx: any,
    args: {
      paymentIntentId: string;
      chargeId: string | null;
      amount: number;
      invoiceId: string;
      companyId: string;
    }
  ) {
    const existing = await tx
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, args.paymentIntentId));

    if (existing.length > 0) return;

    const [payment] = await tx
      .insert(payments)
      .values({
        companyId: args.companyId,
        invoiceId: args.invoiceId,
        method: 'stripe',
        status: 'completed',
        amount: args.amount.toFixed(2),
        stripePaymentIntentId: args.paymentIntentId,
        stripeChargeId: args.chargeId,
        paidAt: new Date(),
      })
      .returning();

    await tx.insert(invoiceAllocations).values({
      invoiceId: args.invoiceId,
      paymentId: payment.id,
      amountApplied: args.amount.toFixed(2),
    });

    const allocations = await tx
      .select({ sum: sql<number>`SUM(amount_applied)` })
      .from(invoiceAllocations)
      .where(eq(invoiceAllocations.invoiceId, args.invoiceId));

    const totalPaid = Number(allocations[0]?.sum ?? 0);

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, args.invoiceId));

    if (!invoice) return;

    // Determine target status based on payment amount
    const targetStatus =
      totalPaid >= Number(invoice.total)
        ? 'paid'
        : totalPaid > 0
        ? 'partially_paid'
        : invoice.status;

    // Update invoice with payment amounts and potentially new status
    // Note: Since we're inside a transaction and already validated the invoice exists,
    // we apply the status change directly. The state machine guards are for manual operations.
    await tx
      .update(invoices)
      .set({
        status: targetStatus,
        amountPaid: totalPaid.toFixed(2),
        amountDue: (Number(invoice.total) - totalPaid).toFixed(2),
        paidAt: targetStatus === 'paid' ? new Date() : undefined,
      })
      .where(eq(invoices.id, invoice.id));

    // DEPOSIT GATING SIGNAL: When a deposit invoice is fully paid, unblock job scheduling
    if (targetStatus === 'paid' && invoice.invoiceType === 'deposit' && invoice.jobId) {
      await tx
        .update(jobs)
        .set({
          depositPaid: true,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, invoice.jobId));

      await tx.insert(auditLogs).values({
        companyId: args.companyId,
        action: 'job.deposit_paid',
        entityType: 'job',
        entityId: invoice.jobId,
        newState: {
          depositPaid: true,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        },
      });
    }
  }
}
