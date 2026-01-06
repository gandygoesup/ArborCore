import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  FileText,
  CreditCard,
  CheckCircle2,
  Ban,
  Clock,
} from "lucide-react";
import type { Invoice, Customer, InvoiceLineItem } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; message: string }> = {
  draft: { label: "DRAFT", variant: "secondary", message: "This invoice is not yet ready for payment." },
  sent: { label: "AWAITING PAYMENT", variant: "default", message: "This invoice is ready for payment." },
  partial: { label: "PARTIALLY PAID", variant: "default", message: "This invoice has been partially paid." },
  paid: { label: "PAID", variant: "default", message: "This invoice has been paid in full. Thank you!" },
  void: { label: "VOID", variant: "outline", message: "This invoice has been voided and is no longer valid." },
  refunded: { label: "REFUNDED", variant: "destructive", message: "This invoice has been refunded." },
};

interface PortalInvoice extends Invoice {
  customer: Customer | null;
  company: {
    name: string;
  } | null;
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

export default function InvoicePortal() {
  const [, params] = useRoute("/portal/invoices/:token");
  const token = params?.token;

  const { data, isLoading, error } = useQuery<{ invoice: PortalInvoice; paymentUrl?: string }>({
    queryKey: ['/api/portal/invoices', token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/invoices/${token}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load invoice');
      return res.json();
    },
    enabled: !!token,
  });

  const invoice = data?.invoice;
  const paymentUrl = data?.paymentUrl;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invoice Not Found</h2>
            <p className="text-muted-foreground">
              This invoice link may have expired or is invalid. Please contact the business for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = statusConfig[invoice.status] || statusConfig.sent;
  const lineItems: InvoiceLineItem[] = invoice.lineItems ? (invoice.lineItems as InvoiceLineItem[]) : [];
  const canPay = (invoice.status === "sent" || invoice.status === "partial") && paymentUrl;
  const isOverdue = invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== "paid";

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold" data-testid="text-company-name">
            {invoice.company?.name || "Invoice"}
          </h1>
          <p className="text-muted-foreground mt-1">Invoice {invoice.invoiceNumber}</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle className="text-xl" data-testid="text-invoice-number">
                  {invoice.invoiceNumber}
                </CardTitle>
                {invoice.title && (
                  <p className="text-sm text-muted-foreground">{invoice.title}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={config.variant} data-testid="badge-status">
                {config.label}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive" data-testid="badge-overdue">
                  OVERDUE
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 rounded-md bg-muted/50">
              {invoice.status === "paid" ? (
                <div className="flex items-center gap-3 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">{config.message}</span>
                </div>
              ) : invoice.status === "void" ? (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Ban className="h-5 w-5" />
                  <span className="font-medium">{config.message}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-muted-foreground">{config.message}</span>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Bill To</span>
                <p className="font-medium mt-1" data-testid="text-customer-name">
                  {invoice.customer ? `${invoice.customer.firstName} ${invoice.customer.lastName}` : "-"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Invoice Date</span>
                <p className="font-medium mt-1">{formatDate(invoice.createdAt)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Due Date</span>
                <p className={`font-medium mt-1 ${isOverdue ? "text-destructive" : ""}`}>
                  {formatDate(invoice.dueDate)}
                </p>
              </div>
            </div>

            <Separator />

            {lineItems.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold tracking-wider uppercase">DESCRIPTION</TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">QTY</TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">PRICE</TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">AMOUNT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={item.id || index}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right font-mono">{item.quantity} {item.unit}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="space-y-2 max-w-xs ml-auto">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax ({parseFloat(invoice.taxRate || "0") * 100}%)</span>
                <span className="font-mono">{formatCurrency(invoice.taxAmount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono" data-testid="text-total">{formatCurrency(invoice.total)}</span>
              </div>
              {parseFloat(invoice.amountPaid || "0") > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Amount Paid</span>
                  <span className="font-mono">{formatCurrency(invoice.amountPaid)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-xl pt-2">
                <span>Amount Due</span>
                <span className="font-mono" data-testid="text-due">{formatCurrency(invoice.amountDue)}</span>
              </div>
            </div>

            {canPay && (
              <>
                <Separator />
                <div className="text-center pt-4">
                  <Button
                    size="lg"
                    className="min-w-[200px]"
                    onClick={() => window.location.href = paymentUrl}
                    data-testid="button-pay-now"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay {formatCurrency(invoice.amountDue)} Now
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3">
                    Secure payment powered by Stripe
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Questions about this invoice? Contact {invoice.company?.name || "the business"} directly.
        </p>
      </div>
    </div>
  );
}
