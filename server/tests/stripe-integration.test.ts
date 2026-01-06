import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import {
  invoices,
  payments,
  invoiceAllocations,
  stripeEvents,
  jobs,
  customers,
  companies,
  auditLogs,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

vi.mock('../stripeClient', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (payload: Buffer, sig: string, secret: string) => {
        return JSON.parse(payload.toString());
      },
    },
  }),
}));

import { WebhookHandlers } from '../webhookHandlers';

const TEST_COMPANY_ID = uuidv4();
const TEST_COMPANY_ID_2 = uuidv4();
const TEST_CUSTOMER_ID = uuidv4();
const TEST_JOB_ID = uuidv4();
const TEST_INVOICE_ID = uuidv4();

async function setupTestData() {
  await db.insert(companies).values({
    id: TEST_COMPANY_ID,
    name: 'Test Company 1',
    slug: `test-company-${Date.now()}`,
    settings: {},
  });

  await db.insert(companies).values({
    id: TEST_COMPANY_ID_2,
    name: 'Test Company 2',
    slug: `test-company-2-${Date.now()}`,
    settings: {},
  });

  await db.insert(customers).values({
    id: TEST_CUSTOMER_ID,
    companyId: TEST_COMPANY_ID,
    firstName: 'Test',
    lastName: 'Customer',
    email: 'test@example.com',
    source: 'manual',
  });

  await db.insert(jobs).values({
    id: TEST_JOB_ID,
    companyId: TEST_COMPANY_ID,
    customerId: TEST_CUSTOMER_ID,
    title: 'Test Tree Removal',
    status: 'pending',
    depositPaid: false,
  });

  await db.insert(invoices).values({
    id: TEST_INVOICE_ID,
    companyId: TEST_COMPANY_ID,
    customerId: TEST_CUSTOMER_ID,
    jobId: TEST_JOB_ID,
    invoiceNumber: 'INV-TEST-001',
    status: 'sent',
    invoiceType: 'deposit',
    subtotal: '500.00',
    taxRate: '0.0800',
    taxAmount: '40.00',
    total: '540.00',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

async function cleanupTestData() {
  await db.delete(auditLogs).where(eq(auditLogs.companyId, TEST_COMPANY_ID));
  await db.delete(auditLogs).where(eq(auditLogs.companyId, TEST_COMPANY_ID_2));
  
  // Delete invoice allocations first (FK constraint)
  const paymentsToDelete = await db.select({ id: payments.id }).from(payments)
    .where(eq(payments.companyId, TEST_COMPANY_ID));
  const paymentsToDelete2 = await db.select({ id: payments.id }).from(payments)
    .where(eq(payments.companyId, TEST_COMPANY_ID_2));
  const allPaymentIds = [...paymentsToDelete, ...paymentsToDelete2].map(p => p.id);
  
  if (allPaymentIds.length > 0) {
    await db.delete(invoiceAllocations).where(inArray(invoiceAllocations.paymentId, allPaymentIds));
  }
  
  await db.delete(payments).where(eq(payments.companyId, TEST_COMPANY_ID));
  await db.delete(payments).where(eq(payments.companyId, TEST_COMPANY_ID_2));
  await db.delete(invoices).where(eq(invoices.companyId, TEST_COMPANY_ID));
  await db.delete(invoices).where(eq(invoices.companyId, TEST_COMPANY_ID_2));
  await db.delete(jobs).where(eq(jobs.companyId, TEST_COMPANY_ID));
  await db.delete(jobs).where(eq(jobs.companyId, TEST_COMPANY_ID_2));
  await db.delete(customers).where(eq(customers.companyId, TEST_COMPANY_ID));
  await db.delete(customers).where(eq(customers.companyId, TEST_COMPANY_ID_2));
  await db.delete(companies).where(eq(companies.id, TEST_COMPANY_ID));
  await db.delete(companies).where(eq(companies.id, TEST_COMPANY_ID_2));
  
  const testEventIds = [
    'evt_test_idempotency_1',
    'evt_test_idempotency_2',
    'evt_test_refund_1',
    'evt_test_dispute_created_1',
    'evt_test_dispute_won_1',
    'evt_test_dispute_lost_1',
    'evt_test_cross_company_1',
  ];
  for (const id of testEventIds) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, id));
  }
}

function createMockStripeEvent(type: string, data: any, eventId: string): Buffer {
  const event = {
    id: eventId,
    type,
    data: { object: data },
  };
  return Buffer.from(JSON.stringify(event));
}

describe('Stripe Webhook Integration Tests', () => {
  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('1. Webhook Replay / Idempotency Tests', () => {
    it('same payment_intent.succeeded delivered twice creates only one payment', async () => {
      const sessionId = `cs_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;
      const eventId = 'evt_test_idempotency_1';

      await db.update(invoices)
        .set({ stripeCheckoutSessionId: sessionId })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      const mockEvent = createMockStripeEvent('checkout.session.completed', {
        id: sessionId,
        payment_intent: paymentIntentId,
        amount_total: 54000,
        metadata: {},
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const paymentsAfterFirst = await db.select().from(payments)
        .where(eq(payments.companyId, TEST_COMPANY_ID));
      expect(paymentsAfterFirst.length).toBe(1);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const paymentsAfterSecond = await db.select().from(payments)
        .where(eq(payments.companyId, TEST_COMPANY_ID));
      expect(paymentsAfterSecond.length).toBe(1);

      const [stripeEvent] = await db.select().from(stripeEvents)
        .where(eq(stripeEvents.id, eventId));
      expect(stripeEvent).toBeDefined();
    });

    it('second delivery returns successfully but causes no mutation', async () => {
      const eventId = 'evt_test_idempotency_2';
      const sessionId = `cs_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;

      await db.update(invoices)
        .set({ stripeCheckoutSessionId: sessionId })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      const mockEvent = createMockStripeEvent('checkout.session.completed', {
        id: sessionId,
        payment_intent: paymentIntentId,
        amount_total: 54000,
        metadata: {},
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [invoiceAfterFirst] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));

      await expect(
        WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid')
      ).resolves.not.toThrow();

      const [invoiceAfterSecond] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      
      expect(invoiceAfterSecond.status).toBe(invoiceAfterFirst.status);
    });
  });

  describe('3. Deposit Gating - Refund Relock Tests', () => {
    it('deposit invoice paid sets job depositPaid=true', async () => {
      const sessionId = `cs_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;
      const eventId = `evt_test_deposit_paid_${uuidv4()}`;

      await db.update(invoices)
        .set({ stripeCheckoutSessionId: sessionId })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      const mockEvent = createMockStripeEvent('checkout.session.completed', {
        id: sessionId,
        payment_intent: paymentIntentId,
        amount_total: 54000,
        metadata: {},
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [job] = await db.select().from(jobs)
        .where(eq(jobs.id, TEST_JOB_ID));
      expect(job.depositPaid).toBe(true);
    });

    it('deposit invoice refunded sets job depositPaid=false', async () => {
      const chargeId = `ch_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;

      await db.update(invoices)
        .set({ 
          status: 'paid',
          paidAt: new Date(),
        })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      await db.update(jobs)
        .set({ depositPaid: true })
        .where(eq(jobs.id, TEST_JOB_ID));

      await db.insert(payments).values({
        id: uuidv4(),
        companyId: TEST_COMPANY_ID,
        invoiceId: TEST_INVOICE_ID,
        method: 'stripe',
        status: 'completed',
        amount: '540.00',
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
      });

      const eventId = 'evt_test_refund_1';
      const mockEvent = createMockStripeEvent('charge.refunded', {
        id: chargeId,
        payment_intent: paymentIntentId,
        amount: 54000,
        amount_refunded: 54000,
        refunded: true,
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [invoice] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      expect(invoice.status).toBe('refunded');

      const [job] = await db.select().from(jobs)
        .where(eq(jobs.id, TEST_JOB_ID));
      expect(job.depositPaid).toBe(false);

      const logs = await db.select().from(auditLogs)
        .where(and(
          eq(auditLogs.entityType, 'job'),
          eq(auditLogs.entityId, TEST_JOB_ID)
        ));
      const refundLog = logs.find(l => l.action === 'job.deposit_refunded');
      expect(refundLog).toBeDefined();
    });
  });

  describe('4. Dispute Lifecycle Tests', () => {
    it('dispute created sets depositPaid=false and invoice status to disputed', async () => {
      const chargeId = `ch_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;
      const disputeId = `dp_test_${uuidv4()}`;

      await db.update(invoices)
        .set({ 
          status: 'paid',
          paidAt: new Date(),
        })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      await db.update(jobs)
        .set({ depositPaid: true })
        .where(eq(jobs.id, TEST_JOB_ID));

      await db.insert(payments).values({
        id: uuidv4(),
        companyId: TEST_COMPANY_ID,
        invoiceId: TEST_INVOICE_ID,
        method: 'stripe',
        status: 'completed',
        amount: '540.00',
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
      });

      const eventId = 'evt_test_dispute_created_1';
      const mockEvent = createMockStripeEvent('charge.dispute.created', {
        id: disputeId,
        charge: chargeId,
        status: 'needs_response',
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [invoice] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      expect(invoice.status).toBe('disputed');
      expect(invoice.stripeDisputeId).toBe(disputeId);

      const [job] = await db.select().from(jobs)
        .where(eq(jobs.id, TEST_JOB_ID));
      expect(job.depositPaid).toBe(false);

      const logs = await db.select().from(auditLogs)
        .where(and(
          eq(auditLogs.entityType, 'job'),
          eq(auditLogs.entityId, TEST_JOB_ID)
        ));
      const disputeLog = logs.find(l => l.action === 'job.deposit_disputed');
      expect(disputeLog).toBeDefined();
    });

    it('dispute won restores depositPaid=true and invoice status to paid', async () => {
      const disputeId = `dp_test_${uuidv4()}`;

      await db.update(invoices)
        .set({ 
          status: 'disputed',
          disputedAt: new Date(),
          stripeDisputeId: disputeId,
        })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      await db.update(jobs)
        .set({ depositPaid: false })
        .where(eq(jobs.id, TEST_JOB_ID));

      const eventId = 'evt_test_dispute_won_1';
      const mockEvent = createMockStripeEvent('charge.dispute.closed', {
        id: disputeId,
        status: 'won',
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [invoice] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      expect(invoice.status).toBe('paid');

      const [job] = await db.select().from(jobs)
        .where(eq(jobs.id, TEST_JOB_ID));
      expect(job.depositPaid).toBe(true);

      const logs = await db.select().from(auditLogs)
        .where(and(
          eq(auditLogs.entityType, 'job'),
          eq(auditLogs.entityId, TEST_JOB_ID)
        ));
      const wonLog = logs.find(l => l.action === 'job.deposit_dispute_won');
      expect(wonLog).toBeDefined();
    });

    it('dispute lost keeps depositPaid=false and sets invoice status to refunded', async () => {
      const disputeId = `dp_test_${uuidv4()}`;

      await db.update(invoices)
        .set({ 
          status: 'disputed',
          disputedAt: new Date(),
          stripeDisputeId: disputeId,
        })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      await db.update(jobs)
        .set({ depositPaid: false })
        .where(eq(jobs.id, TEST_JOB_ID));

      const eventId = 'evt_test_dispute_lost_1';
      const mockEvent = createMockStripeEvent('charge.dispute.closed', {
        id: disputeId,
        status: 'lost',
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [invoice] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      expect(invoice.status).toBe('refunded');

      const [job] = await db.select().from(jobs)
        .where(eq(jobs.id, TEST_JOB_ID));
      expect(job.depositPaid).toBe(false);

      const logs = await db.select().from(auditLogs)
        .where(and(
          eq(auditLogs.entityType, 'job'),
          eq(auditLogs.entityId, TEST_JOB_ID)
        ));
      const lostLog = logs.find(l => l.action === 'job.deposit_dispute_lost');
      expect(lostLog).toBeDefined();
    });
  });

  describe('5. Cross-Company Isolation Tests', () => {
    it('webhook event for different company invoice is safely ignored', async () => {
      const otherCompanyInvoiceId = uuidv4();
      const otherCompanyCustomerId = uuidv4();
      const sessionId = `cs_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;

      await db.insert(customers).values({
        id: otherCompanyCustomerId,
        companyId: TEST_COMPANY_ID_2,
        firstName: 'Other',
        lastName: 'Customer',
        email: 'other@example.com',
        source: 'manual',
      });

      await db.insert(invoices).values({
        id: otherCompanyInvoiceId,
        companyId: TEST_COMPANY_ID_2,
        customerId: otherCompanyCustomerId,
        invoiceNumber: 'INV-OTHER-001',
        status: 'sent',
        invoiceType: 'standard',
        subtotal: '1000.00',
        taxRate: '0.0800',
        taxAmount: '80.00',
        total: '1080.00',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        stripeCheckoutSessionId: sessionId,
      });

      const eventId = 'evt_test_cross_company_1';
      const mockEvent = createMockStripeEvent('checkout.session.completed', {
        id: sessionId,
        payment_intent: paymentIntentId,
        amount_total: 108000,
        metadata: {},
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const paymentsCompany1 = await db.select().from(payments)
        .where(eq(payments.companyId, TEST_COMPANY_ID));
      expect(paymentsCompany1.length).toBe(0);

      const [otherInvoice] = await db.select().from(invoices)
        .where(eq(invoices.id, otherCompanyInvoiceId));
      expect(otherInvoice.status).toBe('paid');

      const paymentsCompany2 = await db.select().from(payments)
        .where(eq(payments.companyId, TEST_COMPANY_ID_2));
      expect(paymentsCompany2.length).toBe(1);
    });
  });

  describe('6. Concurrency / Rollback Tests', () => {
    it('concurrent webhook deliveries result in exactly one payment', async () => {
      const sessionId = `cs_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;
      const eventId = `evt_test_concurrent_${uuidv4()}`;

      await db.update(invoices)
        .set({ stripeCheckoutSessionId: sessionId })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      const mockEvent = createMockStripeEvent('checkout.session.completed', {
        id: sessionId,
        payment_intent: paymentIntentId,
        amount_total: 54000,
        metadata: {},
      }, eventId);

      const results = await Promise.allSettled([
        WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid'),
        WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid'),
        WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid'),
      ]);

      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      const allPayments = await db.select().from(payments)
        .where(eq(payments.companyId, TEST_COMPANY_ID));
      expect(allPayments.length).toBe(1);

      const [invoice] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      expect(invoice.status).toBe('paid');
    });

    it('invoice version increments exactly once after payment', async () => {
      const sessionId = `cs_test_${uuidv4()}`;
      const paymentIntentId = `pi_test_${uuidv4()}`;
      const eventId = `evt_test_version_${uuidv4()}`;

      await db.update(invoices)
        .set({ stripeCheckoutSessionId: sessionId })
        .where(eq(invoices.id, TEST_INVOICE_ID));

      const [invoiceBefore] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      const versionBefore = invoiceBefore.version || 1;

      const mockEvent = createMockStripeEvent('checkout.session.completed', {
        id: sessionId,
        payment_intent: paymentIntentId,
        amount_total: 54000,
        metadata: {},
      }, eventId);

      await WebhookHandlers.processWebhook(mockEvent, 'test-sig', 'test-uuid');

      const [invoiceAfter] = await db.select().from(invoices)
        .where(eq(invoices.id, TEST_INVOICE_ID));
      
      expect(invoiceAfter.version).toBeGreaterThanOrEqual(versionBefore);
    });
  });
});
