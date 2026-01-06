import type { Express, Response } from 'express';
import { eq, sql } from 'drizzle-orm';

import { db } from '../db';
import { storage } from '../storage';
import {
  requireAuth,
  requireCompany,
  requireRole,
  getAuthedUser,
} from '../auth/authorize';

import {
  invoices,
  payments,
  invoiceAllocations,
} from '@shared/schema';

import { getStripe } from '../stripeClient';

export function registerInvoiceRoutes(app: Express): void {
  // --------------------------------------------------------------------------
  // LIST INVOICES (AR)
  // --------------------------------------------------------------------------
  app.get('/api/invoices', requireAuth, requireCompany(), async (req: any, res: Response) => {
    const { companyId } = getAuthedUser(req);
    if (!companyId) {
      return res.status(400).json({ message: 'Company required' });
    }

    const rows = await db
      .select({
        invoice: invoices,
        totalPaid: sql<number>`COALESCE(SUM(${invoiceAllocations.amountApplied}), 0)`,
      })
      .from(invoices)
      .leftJoin(
        invoiceAllocations,
        eq(invoiceAllocations.invoiceId, invoices.id)
      )
      .where(eq(invoices.companyId, companyId))
      .groupBy(invoices.id);

    res.json(
      rows.map((r) => {
        const paid = Number(r.totalPaid);
        const total = Number(r.invoice.total);

        return {
          ...r.invoice,
          amountPaid: paid.toFixed(2),
          amountDue: Math.max(total - paid, 0).toFixed(2),
        };
      })
    );
  });

  // --------------------------------------------------------------------------
  // CREATE INVOICE FROM APPROVED ESTIMATE SNAPSHOT
  // --------------------------------------------------------------------------
  app.post(
    '/api/invoices/from-estimate',
    requireAuth,
    requireCompany(),
    requireRole('Admin', 'Accountant'),
    async (req: any, res: Response) => {
      const { id: userId, companyId } = getAuthedUser(req);
      if (!companyId) {
        return res.status(400).json({ message: 'Company required' });
      }

      const { estimateId, invoiceType = 'full' } = req.body;

      const estimate = await storage.getEstimate(companyId, estimateId);
      if (!estimate || estimate.status !== 'approved') {
        return res.status(409).json({ message: 'Estimate not billable' });
      }

      const snapshot = await storage.getLatestEstimateSnapshot(companyId, estimateId);
      if (!snapshot) {
        return res.status(400).json({ message: 'Missing estimate snapshot' });
      }

      const invoiceNumber = await storage.generateInvoiceNumber(companyId);
      const company = await storage.getCompany(companyId);

      const [invoice] = await db
        .insert(invoices)
        .values({
          companyId,
          stripeAccountId: company?.stripeAccountId ?? null,
          customerId: estimate.customerId,
          estimateId: estimate.id,
          estimateSnapshotId: snapshot.id,
          invoiceNumber,
          invoiceType,
          status: 'draft',
          subtotal: snapshot.subtotal,
          taxRate: snapshot.taxRate,
          taxAmount: snapshot.taxAmount,
          total: snapshot.total,
          createdBy: userId,
        })
        .returning();

      res.json(invoice);
    }
  );

  // --------------------------------------------------------------------------
  // SEND INVOICE (STRIPE CHECKOUT)
  // --------------------------------------------------------------------------
  app.post(
    '/api/invoices/:id/send',
    requireAuth,
    requireCompany(),
    requireRole('Admin', 'Accountant'),
    async (req: any, res: Response) => {
      const { companyId } = getAuthedUser(req);
      if (!companyId) {
        return res.status(400).json({ message: 'Company required' });
      }

      const invoice = await storage.getInvoice(companyId, req.params.id);

      if (!invoice || invoice.status !== 'draft') {
        return res.status(409).json({ message: 'Invoice not sendable' });
      }

      const stripe = getStripe();
      const customer = await storage.getCustomer(companyId, invoice.customerId);

      const stripeOptions = invoice.stripeAccountId 
        ? { stripeAccount: invoice.stripeAccountId } 
        : undefined;

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: invoice.invoiceNumber },
                unit_amount: Math.round(Number(invoice.total) * 100),
              },
              quantity: 1,
            },
          ],
          customer_email: customer?.email ?? undefined,
          success_url: `${process.env.APP_BASE_URL}/payment/success`,
          cancel_url: `${process.env.APP_BASE_URL}/payment/cancel`,
          metadata: {
            invoiceId: invoice.id,
            companyId,
          },
        },
        stripeOptions
      );

      await db
        .update(invoices)
        .set({
          status: 'sent',
          sentAt: new Date(),
          stripeCheckoutSessionId: session.id,
        })
        .where(eq(invoices.id, invoice.id));

      res.json({ checkoutUrl: session.url });
    }
  );

  // --------------------------------------------------------------------------
  // RECORD OFFLINE PAYMENT (ADMIN / ACCOUNTANT ONLY)
  // --------------------------------------------------------------------------
  app.post(
    '/api/payments/offline',
    requireAuth,
    requireCompany(),
    requireRole('Admin', 'Accountant'),
    async (req: any, res: Response) => {
      const { id: userId, companyId } = getAuthedUser(req);
      if (!companyId) {
        return res.status(400).json({ message: 'Company required' });
      }

      const { invoiceId, amount, method, notes } = req.body;

      const invoice = await storage.getInvoice(companyId, invoiceId);
      if (!invoice || invoice.status === 'paid' || invoice.status === 'voided') {
        return res.status(409).json({ message: 'Invoice not payable' });
      }

      await db.transaction(async (tx) => {
        const [payment] = await tx
          .insert(payments)
          .values({
            companyId,
            invoiceId,
            method,
            status: 'completed',
            amount,
            notes,
            recordedBy: userId,
          })
          .returning();

        await tx.insert(invoiceAllocations).values({
          invoiceId,
          paymentId: payment.id,
          amountApplied: amount,
        });

        const [{ sum }] = await tx
          .select({ sum: sql<number>`SUM(${invoiceAllocations.amountApplied})` })
          .from(invoiceAllocations)
          .where(eq(invoiceAllocations.invoiceId, invoiceId));

        const paid = Number(sum ?? 0);
        const total = Number(invoice.total);

        await tx
          .update(invoices)
          .set({
            status: paid >= total ? 'paid' : 'partial',
            paidAt: paid >= total ? new Date() : undefined,
          })
          .where(eq(invoices.id, invoiceId));
      });

      res.json({ success: true });
    }
  );

  // --------------------------------------------------------------------------
  // VOID INVOICE (NO PAYMENTS ALLOWED)
  // --------------------------------------------------------------------------
  app.post(
    '/api/invoices/:id/void',
    requireAuth,
    requireCompany(),
    requireRole('Admin', 'Accountant'),
    async (req: any, res: Response) => {
      const { companyId } = getAuthedUser(req);
      if (!companyId) {
        return res.status(400).json({ message: 'Company required' });
      }

      const invoice = await storage.getInvoice(companyId, req.params.id);
      if (!invoice) {
        return res.status(404).json({ message: 'Invoice not found' });
      }

      const allocations = await storage.getInvoiceAllocations(invoice.id);
      if (allocations.length > 0) {
        return res.status(409).json({ message: 'Refund instead of void' });
      }

      await db
        .update(invoices)
        .set({
          status: 'voided',
          voidedAt: new Date(),
          voidReason: req.body.reason,
        })
        .where(eq(invoices.id, invoice.id));

      res.json({ success: true });
    }
  );
}
