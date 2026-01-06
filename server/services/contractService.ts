import crypto from 'crypto';
import { storage } from '../storage';
import type { Estimate, EstimateSnapshot, Customer, Company, Contract } from '@shared/schema';

interface WorkItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  laborHours?: number;
  notes?: string;
}

interface ContractGenerationParams {
  estimate: Estimate;
  snapshot: EstimateSnapshot;
  customer: Customer;
  company: Company;
  templateId?: string;
}

interface ContractGenerationResult {
  contract: Contract;
  magicLinkToken: string;
}

function formatCurrency(amount: number | string): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numericAmount);
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function generateWorkItemsContent(workItems: WorkItem[]): string {
  if (!workItems || workItems.length === 0) {
    return 'No work items specified.';
  }

  const lines = workItems.map((item, index) => {
    const price = formatCurrency(item.totalPrice || item.unitPrice * item.quantity);
    return `${index + 1}. ${item.description} - ${item.quantity} ${item.unit} @ ${formatCurrency(item.unitPrice)} = ${price}`;
  });

  return lines.join('\n');
}

function generateDefaultHeaderContent(params: ContractGenerationParams): string {
  const { company, customer, estimate, snapshot } = params;
  const customerName = `${customer.firstName} ${customer.lastName}`.trim();
  const propertyAddress = (estimate as any).jobAddress || 'Address on file';

  return `
SERVICE AGREEMENT

${company.name}
Contract #: {{contractNumber}}
Date: ${formatDate(new Date())}

CUSTOMER INFORMATION
Name: ${customerName}
Phone: ${customer.phone || 'N/A'}
Email: ${customer.email || 'N/A'}
Property Address: ${propertyAddress}

ESTIMATE REFERENCE: ${estimate.estimateNumber || 'N/A'}
`.trim();
}

function generateDefaultTermsContent(params: ContractGenerationParams): string {
  const { company } = params;
  
  return `
TERMS AND CONDITIONS

1. SCOPE OF WORK
The Contractor agrees to perform the tree service work as described above at the property address listed.

2. PAYMENT TERMS
Payment is due according to the payment plan selected at the time of estimate approval. All work will be performed after receipt of any required deposit.

3. WORK SCHEDULE
Work will be scheduled based on weather conditions and crew availability. The Contractor will provide reasonable notice of the scheduled work date.

4. PROPERTY ACCESS
The Customer agrees to provide access to the property for the performance of work. The Customer is responsible for identifying any underground utilities, irrigation systems, or other obstructions.

5. CLEANUP
All debris generated from the work will be removed from the property unless otherwise specified. Stump grinding chips will be left on-site unless removal is included in the scope of work.

6. WARRANTY
Work is guaranteed for a period of 30 days from completion. This warranty covers workmanship only and does not cover acts of nature or subsequent damage.

7. LIABILITY
The Contractor maintains liability insurance and workers' compensation coverage. The Customer is responsible for any pre-existing damage to property.

8. CANCELLATION
Cancellation requests must be made at least 48 hours before the scheduled work date. Deposits are non-refundable if cancellation is made less than 48 hours before scheduled work.

9. DISPUTES
Any disputes arising from this agreement shall be resolved through mediation before pursuing legal action.

10. ENTIRE AGREEMENT
This contract represents the entire agreement between the parties and supersedes any prior verbal or written agreements.
`.trim();
}

function generateDefaultFooterContent(params: ContractGenerationParams): string {
  const { company, snapshot } = params;
  const total = parseFloat(snapshot.total as string);

  return `
PRICING SUMMARY
Subtotal: ${formatCurrency(snapshot.subtotal as string)}
Tax (${snapshot.taxRate || 0}%): ${formatCurrency(snapshot.taxAmount as string)}
TOTAL: ${formatCurrency(total)}

AGREEMENT

By signing below, the Customer acknowledges that they have read and agree to the terms and conditions of this service agreement.

Customer Signature: ___________________________ Date: _______________

Printed Name: ________________________________

${company.name} appreciates your business!
`.trim();
}

export async function generateContractFromEstimate(
  params: ContractGenerationParams
): Promise<ContractGenerationResult> {
  const { estimate, snapshot, customer, company, templateId } = params;

  let template = null;
  if (templateId) {
    template = await storage.getContractTemplate(company.id, templateId);
  }
  if (!template) {
    template = await storage.getDefaultContractTemplate(company.id);
  }

  let headerContent: string;
  let termsContent: string;
  let footerContent: string;

  if (template) {
    headerContent = template.headerContent || generateDefaultHeaderContent(params);
    termsContent = template.termsContent || generateDefaultTermsContent(params);
    footerContent = template.footerContent || generateDefaultFooterContent(params);
  } else {
    headerContent = generateDefaultHeaderContent(params);
    termsContent = generateDefaultTermsContent(params);
    footerContent = generateDefaultFooterContent(params);
  }

  const workItems = (snapshot.workItemsSnapshot as WorkItem[]) || [];
  const workItemsContent = generateWorkItemsContent(workItems);

  const contractNumber = await storage.generateContractNumber(company.id);
  
  headerContent = headerContent.replace(/\{\{contractNumber\}\}/g, contractNumber);

  const magicLinkToken = crypto.randomBytes(32).toString('hex');
  const magicLinkTokenHash = crypto
    .createHash('sha256')
    .update(magicLinkToken)
    .digest('hex');
  const magicLinkExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const estimateSnapshotData = {
    estimateId: estimate.id,
    estimateNumber: estimate.estimateNumber,
    total: snapshot.total,
    subtotal: snapshot.subtotal,
    taxRate: snapshot.taxRate,
    taxAmount: snapshot.taxAmount,
    workItems: workItems,
    snapshotVersion: snapshot.snapshotVersion,
    approvedAt: estimate.approvedAt,
  };

  const contract = await storage.createContract({
    companyId: company.id,
    estimateId: estimate.id,
    customerId: customer.id,
    templateId: template?.id || null,
    contractNumber,
    status: 'sent',
    headerContent,
    workItemsContent,
    termsContent,
    footerContent,
    estimateSnapshot: estimateSnapshotData,
    magicLinkTokenHash,
    magicLinkExpiresAt,
    sentAt: new Date(),
  });

  await storage.createAuditLogEntry({
    companyId: company.id,
    action: 'contract.generated',
    entityType: 'contract',
    entityId: contract.id,
    newState: { 
      contractNumber, 
      estimateId: estimate.id,
      status: 'sent',
    },
  });

  return {
    contract,
    magicLinkToken,
  };
}

export async function getContractMagicLinkUrl(token: string): Promise<string> {
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.BASE_URL || 'http://localhost:5000';
  return `${baseUrl}/contracts/${token}/sign`;
}
