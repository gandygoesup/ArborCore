import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Building2,
  User,
  Calendar,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface WorkItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  notes?: string;
}

interface PricingBreakdown {
  laborCost: number;
  equipmentCost: number;
  overheadAllocation: number;
  directCosts: number;
  marginAmount: number;
  floorPrice: number;
  calculatedPrice: number;
  finalPrice: number;
}

interface PortalEstimateResponse {
  estimate: {
    id: string;
    estimateNumber: string;
    status: string;
    title: string | null;
    description: string | null;
    validUntil: string | null;
    sentAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    isActionable: boolean;
  };
  snapshot: {
    workItemsSnapshot: WorkItem[];
    pricingBreakdown: PricingBreakdown | null;
    subtotal: string | null;
    taxRate: string | null;
    taxAmount: string | null;
    total: string | null;
  } | null;
  customer: {
    name: string;
  } | null;
  company: {
    name: string;
  } | null;
}

type ProposalStatus = "sent" | "approved" | "rejected" | "expired";

const statusConfig: Record<ProposalStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ReactNode }> = {
  sent: { label: "Awaiting Response", variant: "secondary", icon: <FileText className="h-4 w-4" /> },
  approved: { label: "Approved", variant: "default", icon: <CheckCircle2 className="h-4 w-4" /> },
  rejected: { label: "Rejected", variant: "destructive", icon: <XCircle className="h-4 w-4" /> },
  expired: { label: "Expired", variant: "outline", icon: <AlertCircle className="h-4 w-4" /> },
};

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

export default function Proposal() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionCompleted, setActionCompleted] = useState<"approved" | "rejected" | null>(null);

  const { data, isLoading, error } = useQuery<PortalEstimateResponse>({
    queryKey: ['/api/portal/estimates', token],
    queryFn: async () => {
      const response = await fetch(`/api/portal/estimates/${token}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 410 || response.status === 404) {
          throw new Error('LINK_INVALID');
        }
        if (response.status === 429) {
          throw new Error('TOO_MANY_REQUESTS');
        }
        throw new Error('FETCH_FAILED');
      }
      return response.json();
    },
    retry: false,
    staleTime: 30000,
  });

  const handleApprove = async () => {
    if (!token) return;
    
    setIsApproving(true);
    try {
      const response = await fetch(`/api/portal/estimates/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        if (response.status === 410) {
          toast({ 
            title: "Unable to approve", 
            description: "This link is no longer valid.",
            variant: "destructive" 
          });
          return;
        }
        if (response.status === 429) {
          toast({ 
            title: "Too many requests", 
            description: "Please try again in a moment.",
            variant: "destructive" 
          });
          return;
        }
        throw new Error('Failed to approve');
      }
      
      setActionCompleted("approved");
      toast({ title: "Proposal approved", description: "Thank you for your approval." });
    } catch (err) {
      toast({ 
        title: "Error", 
        description: "Something went wrong. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    
    setIsRejecting(true);
    try {
      const response = await fetch(`/api/portal/estimates/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      
      if (!response.ok) {
        if (response.status === 410) {
          toast({ 
            title: "Unable to reject", 
            description: "This link is no longer valid.",
            variant: "destructive" 
          });
          return;
        }
        if (response.status === 429) {
          toast({ 
            title: "Too many requests", 
            description: "Please try again in a moment.",
            variant: "destructive" 
          });
          return;
        }
        throw new Error('Failed to reject');
      }
      
      setActionCompleted("rejected");
      setShowRejectDialog(false);
      toast({ title: "Proposal declined", description: "We've recorded your decision." });
    } catch (err) {
      toast({ 
        title: "Error", 
        description: "Something went wrong. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsRejecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    const errorMessage = (error as Error).message;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle data-testid="text-error-title">
              {errorMessage === 'TOO_MANY_REQUESTS' 
                ? 'Too Many Requests' 
                : 'Link Not Available'}
            </CardTitle>
            <CardDescription data-testid="text-error-message">
              {errorMessage === 'TOO_MANY_REQUESTS'
                ? 'Please wait a moment and try again.'
                : 'This link is no longer valid. Please contact the service provider for assistance.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { estimate, snapshot, customer, company } = data;
  const isActionable = estimate.isActionable && !actionCompleted;
  const statusKey = (estimate.status as ProposalStatus) || "sent";
  const status = statusConfig[statusKey] || statusConfig.sent;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="space-y-1">
                {company && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Building2 className="h-4 w-4" />
                    <span data-testid="text-company-name">{company.name}</span>
                  </div>
                )}
                <CardTitle className="text-2xl" data-testid="text-proposal-title">
                  {estimate.title || `Proposal ${estimate.estimateNumber}`}
                </CardTitle>
                {customer && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <User className="h-4 w-4" />
                    <span data-testid="text-customer-name">For: {customer.name}</span>
                  </div>
                )}
              </div>
              <Badge 
                variant={status.variant} 
                className="flex items-center gap-1 shrink-0"
                data-testid="badge-status"
              >
                {status.icon}
                {actionCompleted === "approved" ? "Approved" : 
                 actionCompleted === "rejected" ? "Rejected" : 
                 status.label}
              </Badge>
            </div>
            {estimate.description && (
              <CardDescription className="mt-4" data-testid="text-description">
                {estimate.description}
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {estimate.sentAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Sent: {formatDate(estimate.sentAt)}</span>
                </div>
              )}
              {estimate.validUntil && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Valid until: {formatDate(estimate.validUntil)}</span>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-4">Scope of Work</h3>
              {snapshot?.workItemsSnapshot && snapshot.workItemsSnapshot.length > 0 ? (
                <div className="space-y-3">
                  {snapshot.workItemsSnapshot.map((item, index) => (
                    <div 
                      key={item.id || index} 
                      className="p-4 border rounded-md"
                      data-testid={`work-item-${index}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <p className="font-medium">{item.description}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.quantity} {item.unit}
                          </p>
                          {item.notes && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No work items specified.</p>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-4">Pricing Summary</h3>
              {snapshot ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium" data-testid="text-subtotal">
                      {formatCurrency(snapshot.subtotal)}
                    </span>
                  </div>
                  {snapshot.taxAmount && parseFloat(snapshot.taxAmount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Tax ({snapshot.taxRate ? `${parseFloat(snapshot.taxRate) * 100}%` : ''})
                      </span>
                      <span data-testid="text-tax">
                        {formatCurrency(snapshot.taxAmount)}
                      </span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between text-base">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold" data-testid="text-total">
                      {formatCurrency(snapshot.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Pricing not available.</p>
              )}
            </div>
          </CardContent>

          {isActionable && (
            <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6">
              <Button
                className="w-full sm:w-auto"
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                data-testid="button-approve"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isApproving ? "Approving..." : "Approve Proposal"}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowRejectDialog(true)}
                disabled={isApproving || isRejecting}
                data-testid="button-reject"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Decline
              </Button>
            </CardFooter>
          )}

          {(actionCompleted || (!isActionable && estimate.status !== "sent")) && (
            <CardFooter className="pt-6">
              <div className="w-full text-center text-muted-foreground">
                {actionCompleted === "approved" && (
                  <p data-testid="text-action-completed">
                    Thank you for approving this proposal. The service provider will be in touch shortly.
                  </p>
                )}
                {actionCompleted === "rejected" && (
                  <p data-testid="text-action-completed">
                    You have declined this proposal. The service provider has been notified.
                  </p>
                )}
                {!actionCompleted && estimate.status === "approved" && (
                  <p data-testid="text-status-message">
                    This proposal has been approved.
                  </p>
                )}
                {!actionCompleted && estimate.status === "rejected" && (
                  <p data-testid="text-status-message">
                    This proposal has been declined.
                  </p>
                )}
              </div>
            </CardFooter>
          )}
        </Card>
      </div>

      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to decline this proposal? You can optionally provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              placeholder="Let us know why you're declining..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-2"
              data-testid="input-reject-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRejecting} data-testid="button-cancel-reject">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleReject} 
              disabled={isRejecting}
              data-testid="button-confirm-reject"
            >
              {isRejecting ? "Declining..." : "Decline Proposal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
