import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, 
  Plus, 
  AlertCircle,
  Clock,
  CheckCircle,
  ArrowRight,
  Receipt
} from "lucide-react";

type Invoice = {
  id: string;
  estimateId: string;
  status: string;
  invoiceNumber: string;
  subtotal: string;
  tax: string;
  total: string;
  amountPaid: string;
  dueDate: string | null;
  issuedAt: string | null;
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground", icon: Clock },
  issued: { label: "Issued", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Receipt },
  partially_paid: { label: "Partial", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", icon: AlertCircle },
  paid: { label: "Paid", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: AlertCircle },
};

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const config = statusConfig[invoice.status] || statusConfig.draft;
  const Icon = config.icon;
  const total = parseFloat(invoice.total || "0");
  const paid = parseFloat(invoice.amountPaid || "0");
  const balance = total - paid;

  return (
    <Link href={`/invoices/${invoice.id}`} data-testid={`link-invoice-${invoice.id}`}>
      <Card className="mb-2 hover-elevate" data-testid={`card-invoice-${invoice.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm">{invoice.invoiceNumber}</span>
                <Badge variant="secondary" className={config.color}>
                  <Icon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
              </div>
              {invoice.customer && (
                <p className="text-sm text-muted-foreground truncate">
                  {invoice.customer.firstName} {invoice.customer.lastName}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold">${balance.toLocaleString()}</p>
              {paid > 0 && paid < total && (
                <p className="text-xs text-muted-foreground">
                  of ${total.toLocaleString()}
                </p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function AgingBucket({ 
  title, 
  amount, 
  count, 
  variant = "default",
  testId
}: { 
  title: string; 
  amount: number; 
  count: number;
  variant?: "default" | "warning" | "danger";
  testId: string;
}) {
  const colors = {
    default: "text-foreground",
    warning: "text-yellow-600 dark:text-yellow-400",
    danger: "text-red-600 dark:text-red-400",
  };

  return (
    <Card data-testid={testId}>
      <CardHeader className="p-3 md:p-6 pb-2">
        <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0">
        <div className={`text-xl md:text-2xl font-bold ${colors[variant]}`} data-testid={`${testId}-amount`}>
          ${amount.toLocaleString()}
        </div>
        <p className="text-xs text-muted-foreground" data-testid={`${testId}-count`}>{count} invoices</p>
      </CardContent>
    </Card>
  );
}

export default function Money() {
  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const now = new Date();
  
  const calculateAging = () => {
    const current = { amount: 0, count: 0 };
    const thirty = { amount: 0, count: 0 };
    const sixty = { amount: 0, count: 0 };
    const ninety = { amount: 0, count: 0 };

    invoices
      .filter(inv => ["issued", "partially_paid", "overdue"].includes(inv.status))
      .forEach(inv => {
        const balance = parseFloat(inv.total) - parseFloat(inv.amountPaid || "0");
        if (balance <= 0) return;

        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
        if (!dueDate) {
          current.amount += balance;
          current.count++;
          return;
        }

        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysOverdue <= 0) {
          current.amount += balance;
          current.count++;
        } else if (daysOverdue <= 30) {
          thirty.amount += balance;
          thirty.count++;
        } else if (daysOverdue <= 60) {
          sixty.amount += balance;
          sixty.count++;
        } else {
          ninety.amount += balance;
          ninety.count++;
        }
      });

    return { current, thirty, sixty, ninety };
  };

  const aging = calculateAging();
  const totalAR = aging.current.amount + aging.thirty.amount + aging.sixty.amount + aging.ninety.amount;

  const openInvoices = invoices.filter(inv => 
    ["issued", "partially_paid", "overdue"].includes(inv.status)
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-6 border-b">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">Money</h1>
          <p className="text-sm md:text-base text-muted-foreground">Accounts receivable and payments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="md:size-default min-h-10 md:min-h-9" asChild>
            <Link href="/billing" data-testid="link-all-invoices">
              <span className="hidden sm:inline">All </span>Invoices
            </Link>
          </Button>
          <Button size="sm" className="md:size-default min-h-10 md:min-h-9" data-testid="button-record-payment">
            <Plus className="h-4 w-4 mr-1 md:mr-2" />
            <span className="hidden sm:inline">Record </span>Payment
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">AR Aging</h2>
            <Badge variant="outline" className="ml-auto">
              Total: ${totalAR.toLocaleString()}
            </Badge>
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-3 md:p-4">
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-8 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4" data-testid="ar-aging-grid">
              <AgingBucket 
                title="Current" 
                amount={aging.current.amount} 
                count={aging.current.count}
                testId="bucket-current"
              />
              <AgingBucket 
                title="1-30 Days" 
                amount={aging.thirty.amount} 
                count={aging.thirty.count}
                variant="warning"
                testId="bucket-30"
              />
              <AgingBucket 
                title="31-60 Days" 
                amount={aging.sixty.amount} 
                count={aging.sixty.count}
                variant="warning"
                testId="bucket-60"
              />
              <AgingBucket 
                title="60+ Days" 
                amount={aging.ninety.amount} 
                count={aging.ninety.count}
                variant="danger"
                testId="bucket-90"
              />
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Open Invoices</h2>
          <Badge variant="outline">{openInvoices.length}</Badge>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : openInvoices.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">No open invoices</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Invoices are created from approved estimates. 
                Go to Pipeline to work on estimates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[400px]">
            {openInvoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
