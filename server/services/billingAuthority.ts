import { db } from '../db';
import { invoices, jobs, companySettings, type InvoiceStatus, type JobStatus } from '@shared/schema';
import { eq, and, or, inArray, lt, isNotNull } from 'drizzle-orm';

export interface DepositGatingResult {
  depositRequired: boolean;
  depositPaid: boolean;
  schedulingAllowed: boolean;
  depositInvoiceId: string | null;
  depositInvoiceStatus: InvoiceStatus | null;
  depositAmount: number | null;
}

export interface JobCloseOutCheck {
  canClose: boolean;
  reason?: string;
  unpaidInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    amountDue: number;
  }>;
  totalOutstanding: number;
}

export interface ARAgingBucket {
  bucket: '0-7' | '8-30' | '31-60' | '60+';
  count: number;
  totalAmount: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    daysOutstanding: number;
    amountDue: number;
    customerId: string;
  }>;
}

export interface InvoiceAgingInfo {
  invoiceId: string;
  invoiceNumber: string;
  daysOutstanding: number;
  bucket: '0-7' | '8-30' | '31-60' | '60+';
  amountDue: number;
  isOverdue: boolean;
}

export async function getDepositGatingStatus(companyId: string, jobId: string): Promise<DepositGatingResult> {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)));

  if (!job) {
    return {
      depositRequired: false,
      depositPaid: false,
      schedulingAllowed: false,
      depositInvoiceId: null,
      depositInvoiceStatus: null,
      depositAmount: null,
    };
  }

  const [settings] = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId));

  const depositPolicy = settings?.depositPolicy || 'required';
  const depositRequired = depositPolicy === 'required';

  if (!depositRequired) {
    return {
      depositRequired: false,
      depositPaid: true,
      schedulingAllowed: true,
      depositInvoiceId: null,
      depositInvoiceStatus: null,
      depositAmount: null,
    };
  }

  const depositInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.jobId, jobId),
        eq(invoices.invoiceType, 'deposit')
      )
    );

  if (depositInvoices.length === 0) {
    return {
      depositRequired: true,
      depositPaid: false,
      schedulingAllowed: false,
      depositInvoiceId: null,
      depositInvoiceStatus: null,
      depositAmount: null,
    };
  }

  const depositInvoice = depositInvoices[0];
  const isPaid = depositInvoice.status === 'paid';

  return {
    depositRequired: true,
    depositPaid: isPaid,
    schedulingAllowed: isPaid,
    depositInvoiceId: depositInvoice.id,
    depositInvoiceStatus: depositInvoice.status as InvoiceStatus,
    depositAmount: Number(depositInvoice.total),
  };
}

export async function canScheduleJob(companyId: string, jobId: string): Promise<{ allowed: boolean; reason?: string }> {
  const gating = await getDepositGatingStatus(companyId, jobId);

  if (!gating.depositRequired) {
    return { allowed: true };
  }

  if (!gating.depositPaid) {
    return {
      allowed: false,
      reason: 'Deposit invoice must be paid before scheduling. ' +
        (gating.depositInvoiceId 
          ? `Current status: ${gating.depositInvoiceStatus}` 
          : 'No deposit invoice exists.'),
    };
  }

  return { allowed: true };
}

export async function enforceSchedulingGate(
  companyId: string,
  jobId: string,
  newStatus: JobStatus
): Promise<{ allowed: boolean; reason?: string }> {
  if (newStatus !== 'scheduled') {
    return { allowed: true };
  }

  return canScheduleJob(companyId, jobId);
}

export async function checkJobCloseOut(companyId: string, jobId: string): Promise<JobCloseOutCheck> {
  const jobInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      amountDue: invoices.amountDue,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
    })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)));

  const paidOrWrittenOff: InvoiceStatus[] = ['paid', 'written_off', 'voided', 'refunded'];
  
  const unpaidInvoices = jobInvoices
    .filter(inv => !paidOrWrittenOff.includes(inv.status as InvoiceStatus))
    .map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status as InvoiceStatus,
      amountDue: Number(inv.amountDue || inv.total) - Number(inv.amountPaid || 0),
    }));

  const totalOutstanding = unpaidInvoices.reduce((sum, inv) => sum + inv.amountDue, 0);

  if (unpaidInvoices.length === 0) {
    return {
      canClose: true,
      unpaidInvoices: [],
      totalOutstanding: 0,
    };
  }

  return {
    canClose: false,
    reason: `${unpaidInvoices.length} invoice(s) still outstanding. Total due: $${totalOutstanding.toFixed(2)}`,
    unpaidInvoices,
    totalOutstanding,
  };
}

export async function enforceCloseOutGate(
  companyId: string,
  jobId: string,
  newStatus: JobStatus
): Promise<{ allowed: boolean; reason?: string }> {
  if (newStatus !== 'closed') {
    return { allowed: true };
  }

  const check = await checkJobCloseOut(companyId, jobId);

  if (!check.canClose) {
    return {
      allowed: false,
      reason: check.reason,
    };
  }

  return { allowed: true };
}

export function calculateDaysOutstanding(sentAt: Date | null, dueDate: Date | null): number {
  if (!sentAt) return 0;
  
  const now = new Date();
  const referenceDate = dueDate || sentAt;
  const diffMs = now.getTime() - referenceDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function getAgingBucket(daysOutstanding: number): '0-7' | '8-30' | '31-60' | '60+' {
  if (daysOutstanding <= 7) return '0-7';
  if (daysOutstanding <= 30) return '8-30';
  if (daysOutstanding <= 60) return '31-60';
  return '60+';
}

export async function getInvoiceAgingInfo(invoiceId: string): Promise<InvoiceAgingInfo | null> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!invoice) return null;

  const daysOutstanding = calculateDaysOutstanding(invoice.sentAt, invoice.dueDate);
  const bucket = getAgingBucket(daysOutstanding);
  const amountDue = Number(invoice.amountDue || invoice.total) - Number(invoice.amountPaid || 0);

  const unpaidStatuses: InvoiceStatus[] = ['sent', 'viewed', 'partially_paid', 'overdue'];
  const isOverdue = unpaidStatuses.includes(invoice.status as InvoiceStatus) && daysOutstanding > 0;

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    daysOutstanding,
    bucket,
    amountDue,
    isOverdue,
  };
}

export async function getCompanyARAgingReport(companyId: string): Promise<ARAgingBucket[]> {
  const unpaidStatuses: InvoiceStatus[] = ['sent', 'viewed', 'partially_paid', 'overdue'];

  const unpaidInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        inArray(invoices.status, unpaidStatuses)
      )
    );

  const buckets: Record<'0-7' | '8-30' | '31-60' | '60+', ARAgingBucket> = {
    '0-7': { bucket: '0-7', count: 0, totalAmount: 0, invoices: [] },
    '8-30': { bucket: '8-30', count: 0, totalAmount: 0, invoices: [] },
    '31-60': { bucket: '31-60', count: 0, totalAmount: 0, invoices: [] },
    '60+': { bucket: '60+', count: 0, totalAmount: 0, invoices: [] },
  };

  for (const invoice of unpaidInvoices) {
    const daysOutstanding = calculateDaysOutstanding(invoice.sentAt, invoice.dueDate);
    const bucket = getAgingBucket(daysOutstanding);
    const amountDue = Number(invoice.amountDue || invoice.total) - Number(invoice.amountPaid || 0);

    buckets[bucket].count++;
    buckets[bucket].totalAmount += amountDue;
    buckets[bucket].invoices.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      daysOutstanding,
      amountDue,
      customerId: invoice.customerId,
    });
  }

  return Object.values(buckets);
}

export async function processOverdueInvoices(companyId: string): Promise<{
  processed: number;
  markedOverdue: string[];
}> {
  const eligibleStatuses: InvoiceStatus[] = ['sent', 'viewed', 'partially_paid'];
  const now = new Date();

  const eligibleInvoices = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        inArray(invoices.status, eligibleStatuses),
        isNotNull(invoices.dueDate),
        lt(invoices.dueDate, now)
      )
    );

  const markedOverdue: string[] = [];

  for (const invoice of eligibleInvoices) {
    await db
      .update(invoices)
      .set({
        status: 'overdue',
        overdueAt: now,
        updatedAt: now,
      })
      .where(eq(invoices.id, invoice.id));

    markedOverdue.push(invoice.id);
  }

  return {
    processed: eligibleInvoices.length,
    markedOverdue,
  };
}

export async function writeOffInvoice(
  invoiceId: string,
  reason: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  const allowedStatuses: InvoiceStatus[] = ['overdue', 'disputed'];
  if (!allowedStatuses.includes(invoice.status as InvoiceStatus)) {
    return { 
      success: false, 
      error: `Cannot write off invoice with status '${invoice.status}'. Must be 'overdue' or 'disputed'.` 
    };
  }

  const now = new Date();
  await db
    .update(invoices)
    .set({
      status: 'written_off',
      writtenOffAt: now,
      writtenOffReason: reason,
      writtenOffBy: userId,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoiceId));

  return { success: true };
}

export async function recalculateARAgingForCompany(companyId: string): Promise<{
  processedCount: number;
  overdueCount: number;
}> {
  const result = await processOverdueInvoices(companyId);
  return {
    processedCount: result.processed,
    overdueCount: result.markedOverdue.length,
  };
}

export async function markInvoiceViewed(invoiceId: string): Promise<{ success: boolean; error?: string }> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!invoice) {
    return { success: false, error: 'Invoice not found' };
  }

  if (invoice.status !== 'sent') {
    return { success: true };
  }

  const now = new Date();
  await db
    .update(invoices)
    .set({
      status: 'viewed',
      viewedAt: now,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoiceId));

  return { success: true };
}
