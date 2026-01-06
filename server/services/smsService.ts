import Twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: Twilio.Twilio | null = null;

function getTwilioClient(): Twilio.Twilio {
  if (!twilioClient) {
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }
    twilioClient = Twilio(accountSid, authToken);
  }
  return twilioClient;
}

export interface SendSMSParams {
  to: string;
  message: string;
}

export interface SendEstimateSMSParams {
  to: string;
  customerName: string;
  companyName: string;
  estimateTotal: string;
  magicLinkUrl: string;
}

export interface SendInvoiceSMSParams {
  to: string;
  customerName: string;
  companyName: string;
  invoiceTotal: string;
  magicLinkUrl: string;
  dueDate?: string;
}

export interface SMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

function isValidPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.startsWith('1') && digits.length === 11) {
    return `+${digits}`;
  }
  
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  if (phone.startsWith('+')) {
    return phone;
  }
  
  return `+${digits}`;
}

function formatCurrency(amount: string | number): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return '0.00';
  return numericAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function sendSMS(params: SendSMSParams): Promise<SMSResult> {
  try {
    if (!isTwilioConfigured()) {
      return {
        success: false,
        error: 'SMS service is not configured',
      };
    }

    if (!isValidPhoneNumber(params.to)) {
      return {
        success: false,
        error: 'Invalid or missing phone number',
      };
    }

    const client = getTwilioClient();
    const formattedPhone = formatPhoneNumber(params.to);

    const message = await client.messages.create({
      body: params.message,
      from: twilioPhoneNumber,
      to: formattedPhone,
    });

    return {
      success: true,
      messageSid: message.sid,
    };
  } catch (error: any) {
    console.error('SMS send error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS',
    };
  }
}

export async function sendEstimateSMS(params: SendEstimateSMSParams): Promise<SMSResult> {
  const formattedTotal = formatCurrency(params.estimateTotal);
  const message = `Hi ${params.customerName}, ${params.companyName} has sent you an estimate for $${formattedTotal}. View and approve it here: ${params.magicLinkUrl}`;
  
  return sendSMS({
    to: params.to,
    message,
  });
}

export async function sendInvoiceSMS(params: SendInvoiceSMSParams): Promise<SMSResult> {
  const formattedTotal = formatCurrency(params.invoiceTotal);
  let message = `Hi ${params.customerName}, ${params.companyName} has sent you an invoice for $${formattedTotal}.`;
  
  if (params.dueDate) {
    message += ` Due: ${params.dueDate}.`;
  }
  
  message += ` View and pay here: ${params.magicLinkUrl}`;
  
  return sendSMS({
    to: params.to,
    message,
  });
}

export async function sendPaymentReminderSMS(params: SendInvoiceSMSParams): Promise<SMSResult> {
  const formattedTotal = formatCurrency(params.invoiceTotal);
  let message = `Hi ${params.customerName}, this is a reminder from ${params.companyName} about your invoice for $${formattedTotal}.`;
  
  if (params.dueDate) {
    message += ` Due: ${params.dueDate}.`;
  }
  
  message += ` Pay here: ${params.magicLinkUrl}`;
  
  return sendSMS({
    to: params.to,
    message,
  });
}

export interface SendContractSMSParams {
  to: string;
  customerName: string;
  companyName: string;
  contractTotal: string;
  magicLinkUrl: string;
}

export async function sendContractSMS(params: SendContractSMSParams): Promise<SMSResult> {
  const formattedTotal = formatCurrency(params.contractTotal);
  const message = `Hi ${params.customerName}, ${params.companyName} has prepared your service contract for $${formattedTotal}. Review and sign here: ${params.magicLinkUrl}`;
  
  return sendSMS({
    to: params.to,
    message,
  });
}

export interface SendPaymentPlanSMSParams {
  to: string;
  customerName: string;
  companyName: string;
  totalAmount: string;
  amountDue: string;
  magicLinkUrl: string;
}

export async function sendPaymentPlanSMS(params: SendPaymentPlanSMSParams): Promise<SMSResult> {
  const formattedTotal = formatCurrency(params.totalAmount);
  const formattedDue = formatCurrency(params.amountDue);
  let message = `Hi ${params.customerName}, ${params.companyName} has shared your payment plan. Total: $${formattedTotal}`;
  
  if (params.amountDue !== params.totalAmount) {
    message += `, remaining: $${formattedDue}`;
  }
  
  message += `. View and make payments here: ${params.magicLinkUrl}`;
  
  return sendSMS({
    to: params.to,
    message,
  });
}

export function isTwilioConfigured(): boolean {
  return !!(accountSid && authToken && twilioPhoneNumber);
}
