import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search,
  AlertCircle,
  FileText,
  ExternalLink,
  MoreVertical,
  Send,
  CreditCard,
  DollarSign,
  Ban,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { Invoice, Customer } from "@shared/schema";

type InvoiceStatusFilter = "all" | "unpaid" | "overdue" | "paid" | "void";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "DRAFT", variant: "secondary" },
  sent: { label: "SENT", variant: "default" },
  partial: { label: "PARTIAL", variant: "default" },
  paid: { label: "PAID", variant: "default" },
  void: { label: "VOID", variant: "outline" },
  refunded: { label: "REFUNDED", variant: "destructive" },
};

interface InvoiceWithDetails extends Invoice {
  customer: Customer | null;
}

function formatCurrency(amount: string | null | undefined): string {
  if (!amount) return "-";
  const num = parseFloat(amount);
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

function isOverdue(invoice: InvoiceWithDetails): boolean {
  if (!invoice.dueDate) return false;
  if (invoice.status === "paid" || invoice.status === "void" || invoice.status === "refunded") return false;
  return new Date(invoice.dueDate) < new Date();
}

export default function Billing() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>("all");
  const { toast } = useToast();

  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidInvoiceId, setVoidInvoiceId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const { data: invoices, isLoading, error } = useQuery<InvoiceWithDetails[]>({
    queryKey: ['/api/invoices'],
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      return await apiRequest('POST', `/api/invoices/${invoiceId}/send`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: "Invoice sent", description: "The customer will receive an email with the payment link." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invoice", description: error.message, variant: "destructive" });
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, reason }: { invoiceId: string; reason: string }) => {
      return await apiRequest('POST', `/api/invoices/${invoiceId}/void`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      toast({ title: "Invoice voided", description: "The invoice has been voided and cannot be paid." });
      setVoidDialogOpen(false);
      setVoidInvoiceId(null);
      setVoidReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to void invoice", description: error.message, variant: "destructive" });
    },
  });

  const filteredInvoices = (invoices ?? []).filter((inv) => {
    const searchLower = searchTerm.toLowerCase();
    const customerName = inv.customer
      ? `${inv.customer.firstName} ${inv.customer.lastName}`.toLowerCase()
      : "";

    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchLower) ||
      (inv.title?.toLowerCase().includes(searchLower) ?? false) ||
      customerName.includes(searchLower);

    let matchesStatus = true;
    if (statusFilter === "unpaid") {
      matchesStatus = inv.status === "draft" || inv.status === "sent" || inv.status === "partial";
    } else if (statusFilter === "overdue") {
      matchesStatus = isOverdue(inv);
    } else if (statusFilter === "paid") {
      matchesStatus = inv.status === "paid";
    } else if (statusFilter === "void") {
      matchesStatus = inv.status === "void" || inv.status === "refunded";
    }

    return matchesSearch && matchesStatus;
  });

  const statusCounts = (invoices ?? []).reduce((acc, inv) => {
    if (inv.status === "draft" || inv.status === "sent" || inv.status === "partial") {
      acc.unpaid = (acc.unpaid || 0) + 1;
    }
    if (isOverdue(inv)) {
      acc.overdue = (acc.overdue || 0) + 1;
    }
    if (inv.status === "paid") {
      acc.paid = (acc.paid || 0) + 1;
    }
    if (inv.status === "void" || inv.status === "refunded") {
      acc.void = (acc.void || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleOpenInvoice = (id: string) => {
    setLocation(`/invoices/${id}`);
  };

  const handleSendInvoice = (invoiceId: string) => {
    sendInvoiceMutation.mutate(invoiceId);
  };

  const handleVoidInvoice = (invoiceId: string) => {
    setVoidInvoiceId(invoiceId);
    setVoidDialogOpen(true);
  };

  const confirmVoid = () => {
    if (voidInvoiceId && voidReason.trim()) {
      voidInvoiceMutation.mutate({ invoiceId: voidInvoiceId, reason: voidReason });
    }
  };

  const filterOptions: { key: InvoiceStatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unpaid", label: "Unpaid" },
    { key: "overdue", label: "Overdue" },
    { key: "paid", label: "Paid" },
    { key: "void", label: "Void/Refunded" },
  ];

  const totalOutstanding = (invoices ?? [])
    .filter((inv) => inv.status === "sent" || inv.status === "partial" || inv.status === "draft")
    .reduce((sum, inv) => sum + parseFloat(inv.amountDue || "0"), 0);

  const totalPaid = (invoices ?? [])
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage invoices and payments</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Outstanding</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold" data-testid="text-outstanding-total">
              {formatCurrency(totalOutstanding.toFixed(2))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{statusCounts.unpaid || 0} unpaid invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm font-medium text-muted-foreground">Overdue</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-destructive" data-testid="text-overdue-count">
              {statusCounts.overdue || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">invoices past due date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Collected</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold" data-testid="text-paid-total">
              {formatCurrency(totalPaid.toFixed(2))}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{statusCounts.paid || 0} paid invoices</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filterOptions.map((option) => {
          const isActive = statusFilter === option.key;
          const count = option.key === "all"
            ? (invoices ?? []).length
            : (statusCounts[option.key] || 0);

          return (
            <Badge
              key={option.key}
              variant={isActive ? "default" : "outline"}
              className={`cursor-pointer ${isActive ? "" : "toggle-elevate"}`}
              onClick={() => setStatusFilter(option.key)}
              data-testid={`filter-${option.key}`}
            >
              {option.label}
              <span className="ml-1.5 text-xs opacity-70">({count})</span>
            </Badge>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice #, customer, or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
              data-testid="input-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8" data-testid="error-invoices">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="text-destructive font-medium">Failed to load invoices</p>
              <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
            </div>
          ) : filteredInvoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">INVOICE #</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">CUSTOMER</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">STATUS</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">TOTAL</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">DUE</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase">DUE DATE</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wider uppercase text-right">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => {
                  const config = statusConfig[invoice.status] || statusConfig.draft;
                  const overdue = isOverdue(invoice);
                  return (
                    <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {invoice.invoiceNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        {invoice.customer ? (
                          `${invoice.customer.firstName} ${invoice.customer.lastName}`
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={config.variant} data-testid={`badge-status-${invoice.id}`}>
                            {config.label}
                          </Badge>
                          {overdue && (
                            <Badge variant="destructive" data-testid={`badge-overdue-${invoice.id}`}>
                              OVERDUE
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium font-mono" data-testid={`total-${invoice.id}`}>
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell className="text-right font-medium font-mono" data-testid={`due-${invoice.id}`}>
                        {formatCurrency(invoice.amountDue)}
                      </TableCell>
                      <TableCell className={`text-sm ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                        {formatDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenInvoice(invoice.id)}
                            data-testid={`button-open-${invoice.id}`}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-menu-${invoice.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {invoice.status === "draft" && (
                                <DropdownMenuItem
                                  onClick={() => handleSendInvoice(invoice.id)}
                                  disabled={sendInvoiceMutation.isPending}
                                  data-testid={`action-send-${invoice.id}`}
                                >
                                  <Send className="h-4 w-4 mr-2" />
                                  Send Invoice
                                </DropdownMenuItem>
                              )}
                              {(invoice.status === "sent" || invoice.status === "partial") && (
                                <DropdownMenuItem
                                  onClick={() => handleOpenInvoice(invoice.id)}
                                  data-testid={`action-payment-${invoice.id}`}
                                >
                                  <CreditCard className="h-4 w-4 mr-2" />
                                  Record Payment
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {invoice.status !== "paid" && invoice.status !== "void" && invoice.status !== "refunded" && (
                                <DropdownMenuItem
                                  onClick={() => handleVoidInvoice(invoice.id)}
                                  className="text-destructive"
                                  data-testid={`action-void-${invoice.id}`}
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  Void Invoice
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No invoices found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter !== "all"
                  ? `No ${filterOptions.find((o) => o.key === statusFilter)?.label.toLowerCase()} invoices match your search.`
                  : "Invoices are created when estimates are approved."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
              onClick={confirmVoid}
              disabled={!voidReason.trim() || voidInvoiceMutation.isPending}
              data-testid="button-void-confirm"
            >
              {voidInvoiceMutation.isPending ? "Voiding..." : "Void Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
