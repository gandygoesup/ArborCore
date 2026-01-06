import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  FileText,
  Send,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Ban,
  ChevronDown,
  Printer,
  User,
  Calendar,
  DollarSign,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Contract, Customer, Company, Estimate } from "@shared/schema";

type ContractStatus = "draft" | "sent" | "signed" | "expired" | "voided";

const statusConfig: Record<ContractStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  sent: { label: "Awaiting Signature", variant: "default", icon: Clock },
  signed: { label: "Signed", variant: "default", icon: CheckCircle2 },
  expired: { label: "Expired", variant: "outline", icon: Ban },
  voided: { label: "Voided", variant: "destructive", icon: Ban },
};

interface ContractWithDetails extends Contract {
  customer: Customer | null;
  company: Company | null;
  estimate: Estimate | null;
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
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ContractDetail() {
  const [, params] = useRoute("/contracts/:id");
  const [, setLocation] = useLocation();
  const contractId = params?.id;
  const { toast } = useToast();

  const { data: contract, isLoading, error } = useQuery<ContractWithDetails>({
    queryKey: ['/api/contracts', contractId],
    queryFn: async () => {
      const res = await fetch(`/api/contracts/${contractId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load contract');
      return res.json();
    },
    enabled: !!contractId,
  });

  const sendMutation = useMutation({
    mutationFn: async (deliveryMethod: string) => {
      const res = await apiRequest("POST", `/api/contracts/${contractId}/send`, { deliveryMethod });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send contract");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contract sent successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/contracts', contractId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send contract",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="p-8">
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Contract Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The contract you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => setLocation("/contracts")} data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Contracts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const config = statusConfig[contract.status as ContractStatus] || statusConfig.draft;
  const StatusIcon = config.icon;
  const snapshot = contract.estimateSnapshot as any;
  const canSend = contract.status === "draft" || contract.status === "sent";

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/contracts")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold" data-testid="text-contract-number">
                {contract.contractNumber}
              </h1>
              <Badge variant={config.variant} data-testid="badge-status">
                <StatusIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Created {formatDate(contract.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {canSend && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={sendMutation.isPending} data-testid="button-send">
                  <Send className="h-4 w-4 mr-2" />
                  {sendMutation.isPending ? "Sending..." : "Send Contract"}
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => sendMutation.mutate("email")}>
                  Send via Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendMutation.mutate("sms")}>
                  Send via SMS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sendMutation.mutate("both")}>
                  Send via Email & SMS
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contract Document
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] rounded-md border p-4 print:h-auto print:border-0">
                {contract.headerContent && (
                  <div className="mb-6">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {contract.headerContent}
                    </pre>
                  </div>
                )}
                
                {contract.workItemsContent && (
                  <div className="mb-6">
                    <h4 className="font-semibold mb-2">SCOPE OF WORK</h4>
                    <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/30 p-3 rounded-md">
                      {contract.workItemsContent}
                    </pre>
                  </div>
                )}

                <Separator className="my-6" />

                {contract.termsContent && (
                  <div className="mb-6">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {contract.termsContent}
                    </pre>
                  </div>
                )}

                <Separator className="my-6" />

                {contract.footerContent && (
                  <div>
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {contract.footerContent}
                    </pre>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contract.customer ? (
                <div className="space-y-2">
                  <p className="font-medium" data-testid="text-customer-name">
                    {contract.customer.firstName} {contract.customer.lastName}
                  </p>
                  {contract.customer.email && (
                    <p className="text-sm text-muted-foreground">{contract.customer.email}</p>
                  )}
                  {contract.customer.phone && (
                    <p className="text-sm text-muted-foreground">{contract.customer.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No customer linked</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {snapshot ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span data-testid="text-subtotal">{formatCurrency(snapshot.subtotal)}</span>
                  </div>
                  {snapshot.taxAmount && parseFloat(snapshot.taxAmount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span data-testid="text-tax">{formatCurrency(snapshot.taxAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span data-testid="text-total">{formatCurrency(snapshot.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No pricing information</p>
              )}
            </CardContent>
          </Card>

          {contract.status === "signed" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Signature Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Signed By</p>
                    <p className="font-medium" data-testid="text-signer-name">
                      {contract.signerName} ({contract.signerInitials})
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Signed At</p>
                    <p className="font-medium" data-testid="text-signed-at">
                      {formatDateTime(contract.signedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{formatDate(contract.createdAt)}</span>
                </div>
                {contract.sentAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sent</span>
                    <span>{formatDate(contract.sentAt)}</span>
                  </div>
                )}
                {contract.signedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Signed</span>
                    <span>{formatDate(contract.signedAt)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
