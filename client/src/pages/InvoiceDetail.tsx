import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  AlertCircle,
  Send,
  CreditCard,
  Ban,
  RotateCcw,
  Clock,
  CheckCircle2,
  Link2,
  Copy,
  DollarSign,
  User,
  Calendar,
} from "lucide-react";
import type { Invoice, Customer, Payment, InvoiceLineItem } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "DRAFT", variant: "secondary" },
  sent: { label: "SENT", variant: "default" },
  partial: { label: "PARTIAL", variant: "default" },
  paid: { label: "PAID", variant: "default" },
  void: { label: "VOID", variant: "outline" },
  refunded: { label: "REFUNDED", variant: "destructive" },
};

const paymentMethodLabels: Record<string, string> = {
  stripe: "Stripe",
  check: "Check",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

interface InvoiceWithDetails extends Invoice {
  customer: Customer | null;
  payments: Payment[];
}

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString();
}

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

export default function InvoiceDetail() {
  const [, params] = useRoute("/invoices/:id");
  const [, setLocation] = useLocation();
  const invoiceId = params?.id;
  const { toast } = useToast();

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [payLinkDialogOpen, setPayLinkDialogOpen] = useState(false);
  const [payLink, setPayLink] = useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const [voidReason, setVoidReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const { data: invoice, isLoading, error } = useQuery<InvoiceWithDetails>({
    queryKey: ['/api/invoices', invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load invoice');
      return res.json();
    },
    enabled: !!invoiceId,
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/invoices/${invoiceId}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      toast({ title: "Invoice sent", description: "The customer will receive an email with the payment link." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const generatePayLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/invoices/${invoiceId}/pay-link`);
      return res.json();
    },
    onSuccess: (data: { checkoutUrl: string }) => {
      setPayLink(data.checkoutUrl);
      setPayLinkDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate payment link", description: error.message, variant: "destructive" });
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: { amount: string; method: string; referenceNumber?: string; notes?: string }) => {
      return await apiRequest('POST', `/api/payments/offline`, { invoiceId, ...data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: "Payment recorded", description: "The payment has been recorded successfully." });
      setPaymentDialogOpen(false);
      resetPaymentForm();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to record payment", description: error.message, variant: "destructive" });
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: async (reason: string) => {
      return await apiRequest('POST', `/api/invoices/${invoiceId}/void`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: "Invoice voided", description: "The invoice has been voided." });
      setVoidDialogOpen(false);
      setVoidReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to void invoice", description: error.message, variant: "destructive" });
    },
  });

  const refundInvoiceMutation = useMutation({
    mutationFn: async (data: { amount: string; reason: string }) => {
      return await apiRequest('POST', `/api/invoices/${invoiceId}/refund`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: "Refund processed", description: "The refund has been processed." });
      setRefundDialogOpen(false);
      setRefundAmount("");
      setRefundReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to process refund", description: error.message, variant: "destructive" });
    },
  });

  const resetPaymentForm = () => {
    setPaymentAmount("");
    setPaymentMethod("");
    setPaymentReference("");
    setPaymentNotes("");
  };

  const handleRecordPayment = () => {
    if (!paymentAmount || !paymentMethod) return;
    recordPaymentMutation.mutate({
      amount: paymentAmount,
      method: paymentMethod,
      referenceNumber: paymentReference || undefined,
      notes: paymentNotes || undefined,
    });
  };

  const handleCopyPayLink = () => {
    if (payLink) {
      navigator.clipboard.writeText(payLink);
      toast({ title: "Copied", description: "Payment link copied to clipboard." });
    }
  };

  const lineItems: InvoiceLineItem[] = invoice?.lineItems ? (invoice.lineItems as InvoiceLineItem[]) : [];
  const config = invoice ? (statusConfig[invoice.status] || statusConfig.draft) : statusConfig.draft;
  const canSend = invoice?.status === "draft";
  const canRecordPayment = invoice?.status === "sent" || invoice?.status === "partial";
  const canVoid = invoice?.status !== "paid" && invoice?.status !== "void" && invoice?.status !== "refunded";
  const canRefund = invoice?.status === "paid";
  const canGeneratePayLink = invoice?.status === "sent" || invoice?.status === "partial";

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-8">
        <div className="text-center py-16">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">Failed to load invoice</p>
          <p className="text-sm text-muted-foreground mt-2">{(error as Error)?.message || "Invoice not found"}</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/billing")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Billing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/billing")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold" data-testid="text-invoice-number">
                {invoice.invoiceNumber}
              </h1>
              <Badge variant={config.variant} data-testid="badge-status">
                {config.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">{invoice.title || "Invoice"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canSend && (
            <Button
              onClick={() => sendInvoiceMutation.mutate()}
              disabled={sendInvoiceMutation.isPending}
              data-testid="button-send"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendInvoiceMutation.isPending ? "Sending..." : "Send Invoice"}
            </Button>
          )}
          {canGeneratePayLink && (
            <Button
              variant="outline"
              onClick={() => generatePayLinkMutation.mutate()}
              disabled={generatePayLinkMutation.isPending}
              data-testid="button-pay-link"
            >
              <Link2 className="h-4 w-4 mr-2" />
              {generatePayLinkMutation.isPending ? "Generating..." : "Get Pay Link"}
            </Button>
          )}
          {canRecordPayment && (
            <Button variant="outline" onClick={() => setPaymentDialogOpen(true)} data-testid="button-record-payment">
              <DollarSign className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
          {canVoid && (
            <Button variant="outline" onClick={() => setVoidDialogOpen(true)} data-testid="button-void">
              <Ban className="h-4 w-4 mr-2" />
              Void
            </Button>
          )}
          {canRefund && (
            <Button variant="outline" onClick={() => setRefundDialogOpen(true)} data-testid="button-refund">
              <RotateCcw className="h-4 w-4 mr-2" />
              Refund
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              {lineItems.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase">DESCRIPTION</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">QTY</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase">UNIT</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">UNIT PRICE</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">AMOUNT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">No line items</p>
              )}

              <Separator className="my-4" />

              <div className="space-y-2 max-w-xs ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono" data-testid="text-subtotal">{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax ({parseFloat(invoice.taxRate || "0") * 100}%)</span>
                  <span className="font-mono" data-testid="text-tax">{formatCurrency(invoice.taxAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="font-mono" data-testid="text-total">{formatCurrency(invoice.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="font-mono" data-testid="text-paid">{formatCurrency(invoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>Amount Due</span>
                  <span className="font-mono" data-testid="text-due">{formatCurrency(invoice.amountDue)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.payments && invoice.payments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase">DATE</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase">METHOD</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase">STATUS</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">AMOUNT</TableHead>
                      <TableHead className="text-xs font-semibold tracking-wider uppercase">REFERENCE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.payments.map((payment) => (
                      <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                        <TableCell className="text-sm">{formatDateTime(payment.paidAt || payment.createdAt)}</TableCell>
                        <TableCell>{paymentMethodLabels[payment.method] || payment.method}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === "succeeded" ? "default" : "secondary"}>
                            {payment.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.referenceNumber || payment.stripePaymentIntentId || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No payments recorded yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Customer</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.customer ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span data-testid="text-customer-name">
                      {invoice.customer.firstName} {invoice.customer.lastName}
                    </span>
                  </div>
                  {invoice.customer.email && (
                    <p className="text-sm text-muted-foreground">{invoice.customer.email}</p>
                  )}
                  {invoice.customer.phone && (
                    <p className="text-sm text-muted-foreground">{invoice.customer.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Customer information unavailable</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Invoice Type</span>
                <p className="font-medium capitalize">{invoice.invoiceType}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Created</span>
                <p className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {formatDate(invoice.createdAt)}
                </p>
              </div>
              {invoice.dueDate && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</span>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
              )}
              {invoice.sentAt && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Sent</span>
                  <p className="font-medium">{formatDateTime(invoice.sentAt)}</p>
                </div>
              )}
              {invoice.paidAt && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Paid</span>
                  <p className="font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    {formatDateTime(invoice.paidAt)}
                  </p>
                </div>
              )}
              {invoice.voidedAt && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Voided</span>
                  <p className="font-medium">{formatDateTime(invoice.voidedAt)}</p>
                  {invoice.voidReason && (
                    <p className="text-sm text-muted-foreground mt-1">Reason: {invoice.voidReason}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record an offline payment (check, cash, bank transfer) for this invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                max={invoice.amountDue ?? undefined}
                placeholder={`Max: ${formatCurrency(invoice.amountDue)}`}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                data-testid="input-payment-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-reference">Reference Number (optional)</Label>
              <Input
                id="payment-reference"
                placeholder="Check #, transaction ID, etc."
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                data-testid="input-payment-reference"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Textarea
                id="payment-notes"
                placeholder="Additional notes about this payment..."
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                data-testid="input-payment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} data-testid="button-payment-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={!paymentAmount || !paymentMethod || recordPaymentMutation.isPending}
              data-testid="button-payment-confirm"
            >
              {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Invoice</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The invoice will be marked as void and the customer will no longer be able to pay it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="void-reason">Reason for voiding</Label>
              <Textarea
                id="void-reason"
                placeholder="Enter the reason for voiding this invoice..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                data-testid="input-void-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)} data-testid="button-void-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => voidInvoiceMutation.mutate(voidReason)}
              disabled={!voidReason.trim() || voidInvoiceMutation.isPending}
              data-testid="button-void-confirm"
            >
              {voidInvoiceMutation.isPending ? "Voiding..." : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Invoice</DialogTitle>
            <DialogDescription>
              Process a refund for this paid invoice. The refund will be processed through the original payment method if applicable.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="refund-amount">Refund Amount</Label>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0"
                max={invoice.amountPaid ?? undefined}
                placeholder={`Max: ${formatCurrency(invoice.amountPaid)}`}
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                data-testid="input-refund-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason for refund</Label>
              <Textarea
                id="refund-reason"
                placeholder="Enter the reason for the refund..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                data-testid="input-refund-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)} data-testid="button-refund-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => refundInvoiceMutation.mutate({ amount: refundAmount, reason: refundReason })}
              disabled={!refundAmount || !refundReason.trim() || refundInvoiceMutation.isPending}
              data-testid="button-refund-confirm"
            >
              {refundInvoiceMutation.isPending ? "Processing..." : "Process Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payLinkDialogOpen} onOpenChange={setPayLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Link</DialogTitle>
            <DialogDescription>
              Share this link with the customer so they can pay online via Stripe.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={payLink || ""}
                className="font-mono text-sm"
                data-testid="input-pay-link"
              />
              <Button variant="outline" size="icon" onClick={handleCopyPayLink} data-testid="button-copy-link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPayLinkDialogOpen(false)} data-testid="button-pay-link-close">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
