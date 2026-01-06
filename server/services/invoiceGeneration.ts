import { db } from '../db';
import {
  invoices,
  estimates,
  estimateSnapshots,
  paymentPlanTemplates,
  type InsertInvoice,
  type Estimate,
  type EstimateSnapshot,
  type PaymentPlanTemplate,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { storage } from '../storage';

export interface MilestoneConfig {
  name: string;
  type: 'percent' | 'flat';
  value: number;
  invoiceType: 'deposit' | 'milestone' | 'final';
}

export interface InvoiceGenerationResult {
  success: boolean;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    total: string;
  }>;
  error?: string;
}

export async function generateDepositInvoice(
  estimateId: string,
  companyId: string,
  createdBy?: string
): Promise<InvoiceGenerationResult> {
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.companyId, companyId)));

  if (!estimate) {
    return { success: false, invoices: [], error: 'Estimate not found' };
  }

  if (estimate.status !== 'approved') {
    return { success: false, invoices: [], error: 'Estimate must be approved to generate invoices' };
  }

  const template = await getDefaultPaymentPlanTemplate(companyId);
  const milestones = (template?.milestones as MilestoneConfig[]) || [];

  const depositMilestone = milestones.find(m => m.invoiceType === 'deposit');

  if (!depositMilestone) {
    return { success: false, invoices: [], error: 'No deposit configuration in payment plan template' };
  }

  const snapshot = await getLatestSnapshot(estimateId);
  if (!snapshot) {
    return { success: false, invoices: [], error: 'No pricing snapshot found for estimate' };
  }

  const estimateTotal = Number(snapshot.total);
  const depositAmount =
    depositMilestone.type === 'percent'
      ? (estimateTotal * depositMilestone.value) / 100
      : depositMilestone.value;

  const taxRate = Number(snapshot.taxRate);
  const subtotal = depositAmount / (1 + taxRate);
  const taxAmount = depositAmount - subtotal;

  const invoiceNumber = await storage.generateInvoiceNumber(companyId);

  const invoiceData: InsertInvoice = {
    companyId,
    customerId: estimate.customerId,
    estimateId: estimate.id,
    estimateSnapshotId: snapshot.id,
    invoiceNumber,
    invoiceType: 'deposit',
    status: 'draft',
    title: `Deposit for ${estimate.title || 'Tree Service'}`,
    description: depositMilestone.name,
    lineItems: [
      {
        description: `${depositMilestone.value}${depositMilestone.type === 'percent' ? '%' : ''} Deposit - ${depositMilestone.name}`,
        quantity: 1,
        unitPrice: subtotal.toFixed(2),
        total: subtotal.toFixed(2),
      },
    ],
    subtotal: subtotal.toFixed(2),
    taxRate: taxRate.toFixed(4),
    taxAmount: taxAmount.toFixed(2),
    total: depositAmount.toFixed(2),
    amountDue: depositAmount.toFixed(2),
    createdBy,
  };

  const invoice = await storage.createInvoice(invoiceData);

  return {
    success: true,
    invoices: [
      {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        total: invoice.total,
      },
    ],
  };
}

export async function generateFinalInvoice(
  estimateId: string,
  companyId: string,
  createdBy?: string
): Promise<InvoiceGenerationResult> {
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.companyId, companyId)));

  if (!estimate) {
    return { success: false, invoices: [], error: 'Estimate not found' };
  }

  const snapshot = await getLatestSnapshot(estimateId);
  if (!snapshot) {
    return { success: false, invoices: [], error: 'No pricing snapshot found for estimate' };
  }

  const existingInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.estimateId, estimateId), eq(invoices.companyId, companyId)));

  const paidAmount = existingInvoices
    .filter(inv => inv.status === 'paid' || inv.status === 'partially_paid')
    .reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0);

  const estimateTotal = Number(snapshot.total);
  const remainingAmount = estimateTotal - paidAmount;

  if (remainingAmount <= 0) {
    return { success: false, invoices: [], error: 'No remaining balance to invoice' };
  }

  const taxRate = Number(snapshot.taxRate);
  const subtotal = remainingAmount / (1 + taxRate);
  const taxAmount = remainingAmount - subtotal;

  const invoiceNumber = await storage.generateInvoiceNumber(companyId);

  const invoiceData: InsertInvoice = {
    companyId,
    customerId: estimate.customerId,
    estimateId: estimate.id,
    estimateSnapshotId: snapshot.id,
    invoiceNumber,
    invoiceType: 'final',
    status: 'draft',
    title: `Final Invoice for ${estimate.title || 'Tree Service'}`,
    description: 'Remaining balance due upon completion',
    lineItems: [
      {
        description: 'Final payment - balance due',
        quantity: 1,
        unitPrice: subtotal.toFixed(2),
        total: subtotal.toFixed(2),
      },
    ],
    subtotal: subtotal.toFixed(2),
    taxRate: taxRate.toFixed(4),
    taxAmount: taxAmount.toFixed(2),
    total: remainingAmount.toFixed(2),
    amountDue: remainingAmount.toFixed(2),
    createdBy,
  };

  const invoice = await storage.createInvoice(invoiceData);

  return {
    success: true,
    invoices: [
      {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        total: invoice.total,
      },
    ],
  };
}

export async function generateFullInvoice(
  estimateId: string,
  companyId: string,
  createdBy?: string
): Promise<InvoiceGenerationResult> {
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.companyId, companyId)));

  if (!estimate) {
    return { success: false, invoices: [], error: 'Estimate not found' };
  }

  const snapshot = await getLatestSnapshot(estimateId);
  if (!snapshot) {
    return { success: false, invoices: [], error: 'No pricing snapshot found for estimate' };
  }

  const invoiceNumber = await storage.generateInvoiceNumber(companyId);
  const total = Number(snapshot.total);
  const taxRate = Number(snapshot.taxRate);
  const taxAmount = Number(snapshot.taxAmount);
  const subtotal = total - taxAmount;

  const invoiceData: InsertInvoice = {
    companyId,
    customerId: estimate.customerId,
    estimateId: estimate.id,
    estimateSnapshotId: snapshot.id,
    invoiceNumber,
    invoiceType: 'full',
    status: 'draft',
    title: estimate.title || 'Tree Service Invoice',
    description: estimate.description,
    lineItems: snapshot.workItemsSnapshot || [],
    subtotal: subtotal.toFixed(2),
    taxRate: taxRate.toFixed(4),
    taxAmount: taxAmount.toFixed(2),
    total: total.toFixed(2),
    amountDue: total.toFixed(2),
    createdBy,
  };

  const invoice = await storage.createInvoice(invoiceData);

  return {
    success: true,
    invoices: [
      {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType,
        total: invoice.total,
      },
    ],
  };
}

async function getDefaultPaymentPlanTemplate(companyId: string): Promise<PaymentPlanTemplate | null> {
  const [template] = await db
    .select()
    .from(paymentPlanTemplates)
    .where(
      and(
        eq(paymentPlanTemplates.companyId, companyId),
        eq(paymentPlanTemplates.isDefault, true),
        eq(paymentPlanTemplates.isActive, true)
      )
    );
  return template || null;
}

async function getLatestSnapshot(estimateId: string): Promise<EstimateSnapshot | null> {
  const [snapshot] = await db
    .select()
    .from(estimateSnapshots)
    .where(eq(estimateSnapshots.estimateId, estimateId))
    .orderBy(desc(estimateSnapshots.createdAt))
    .limit(1);
  return snapshot || null;
}
