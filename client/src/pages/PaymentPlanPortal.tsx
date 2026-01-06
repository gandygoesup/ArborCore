import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  TreePine,
  Scissors,
  Trash2,
  CloudRain,
  Leaf,
  AlertTriangle,
  Send,
  CircleDashed,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PaymentPlanScheduleItem } from "@shared/schema";

interface PortalPaymentPlan {
  id: string;
  planNumber: string;
  status: string;
  title: string | null;
  description: string | null;
  schedule: PaymentPlanScheduleItem[];
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  startDate: string | null;
  expectedCompletionDate: string | null;
}

interface PortalData {
  plan: PortalPaymentPlan;
  customer: {
    name: string;
    email: string | null;
  } | null;
  company: {
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  serviceRequests: Array<{
    id: string;
    requestNumber: string;
    category: string;
    status: string;
    title: string | null;
    createdAt: string;
  }>;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle2 }> = {
  active: { label: "ACTIVE", variant: "default", icon: Clock },
  on_hold: { label: "ON HOLD", variant: "secondary", icon: Clock },
  completed: { label: "COMPLETED", variant: "default", icon: CheckCircle2 },
  cancelled: { label: "CANCELLED", variant: "destructive", icon: AlertCircle },
  overdue: { label: "OVERDUE", variant: "destructive", icon: AlertTriangle },
};

const scheduleStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: typeof CheckCircle2 }> = {
  pending: { label: "Pending", variant: "secondary", icon: CircleDashed },
  due: { label: "Due Now", variant: "default", icon: Clock },
  paid: { label: "Paid", variant: "outline", icon: CheckCircle2 },
  overdue: { label: "Overdue", variant: "destructive" as any, icon: AlertTriangle },
};

const serviceCategories = [
  { value: "tree_removal", label: "Tree Removal", icon: TreePine },
  { value: "tree_trimming", label: "Tree Trimming", icon: Scissors },
  { value: "stump_grinding", label: "Stump Grinding", icon: Trash2 },
  { value: "storm_cleanup", label: "Storm Cleanup", icon: CloudRain },
  { value: "seasonal_maintenance", label: "Seasonal Maintenance", icon: Leaf },
  { value: "brush_clearing", label: "Brush Clearing", icon: TreePine },
  { value: "gutter_cleaning", label: "Gutter Cleaning", icon: Trash2 },
  { value: "emergency_service", label: "Emergency Service", icon: AlertTriangle },
  { value: "other", label: "Other", icon: Plus },
] as const;

function formatCurrency(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "$0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCategoryLabel(category: string): string {
  const found = serviceCategories.find(c => c.value === category);
  return found ? found.label : category;
}

export default function PaymentPlanPortal() {
  const [, params] = useRoute("/payment-plan/:token");
  const token = params?.token;
  const { toast } = useToast();
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [serviceCategory, setServiceCategory] = useState("");
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [preferredTimeframe, setPreferredTimeframe] = useState("");
  const [urgency, setUrgency] = useState("normal");

  const { data, isLoading, error, refetch } = useQuery<PortalData>({
    queryKey: ['/api/portal/payment-plans', token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/payment-plans/${token}`, { credentials: 'include' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to load payment plan');
      }
      return res.json();
    },
    enabled: !!token,
  });

  const initiatePayment = useMutation({
    mutationFn: async (scheduleItemId?: string) => {
      const res = await fetch(`/api/portal/payment-plans/${token}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scheduleItemId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to initiate payment');
      }
      return res.json();
    },
    onSuccess: (result) => {
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitServiceRequest = useMutation({
    mutationFn: async (data: { category: string; title: string; description: string; preferredTimeframe: string; urgency: string }) => {
      const res = await fetch(`/api/portal/payment-plans/${token}/service-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to submit request');
      }
      return res.json();
    },
    onSuccess: (result) => {
      toast({
        title: "Request Submitted",
        description: `Your service request #${result.serviceRequest.requestNumber} has been submitted. We'll contact you soon.`,
      });
      setIsServiceDialogOpen(false);
      resetServiceForm();
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function resetServiceForm() {
    setServiceCategory("");
    setServiceTitle("");
    setServiceDescription("");
    setPreferredTimeframe("");
    setUrgency("normal");
  }

  function handleSubmitService() {
    if (!serviceCategory) {
      toast({ title: "Please select a service category", variant: "destructive" });
      return;
    }
    submitServiceRequest.mutate({
      category: serviceCategory,
      title: serviceTitle,
      description: serviceDescription,
      preferredTimeframe,
      urgency,
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 py-12 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 mx-auto" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Payment Plan Not Found</h2>
            <p className="text-muted-foreground">
              This payment plan link may have expired or is invalid. Please contact the business for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { plan, customer, company, serviceRequests } = data;
  const config = statusConfig[plan.status] || statusConfig.active;
  const StatusIcon = config.icon;
  
  const totalAmount = parseFloat(plan.totalAmount) || 0;
  const amountPaid = parseFloat(plan.amountPaid) || 0;
  const amountDue = parseFloat(plan.amountDue) || 0;
  const progressPercent = totalAmount > 0 ? Math.round((amountPaid / totalAmount) * 100) : 0;

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold" data-testid="text-company-name">
            {company?.name || "Payment Plan"}
          </h1>
          <p className="text-muted-foreground mt-1">Payment Plan {plan.planNumber}</p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <DollarSign className="h-6 w-6 text-muted-foreground" />
              <div>
                <CardTitle className="text-xl" data-testid="text-plan-number">
                  {plan.planNumber}
                </CardTitle>
                {plan.title && (
                  <p className="text-sm text-muted-foreground">{plan.title}</p>
                )}
              </div>
            </div>
            <Badge variant={config.variant} data-testid="badge-status">
              {config.label}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            {plan.description && (
              <p className="text-muted-foreground">{plan.description}</p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Payment Progress</span>
                <span className="font-medium">{progressPercent}% Complete</span>
              </div>
              <Progress value={progressPercent} className="h-3" data-testid="progress-payments" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatCurrency(amountPaid)} paid
                </span>
                <span className="font-medium" data-testid="text-amount-due">
                  {formatCurrency(amountDue)} remaining
                </span>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Customer</span>
                <p className="font-medium mt-1" data-testid="text-customer-name">
                  {customer?.name || "-"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Amount</span>
                <p className="font-medium mt-1" data-testid="text-total-amount">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Expected Completion</span>
                <p className="font-medium mt-1">
                  {formatDate(plan.expectedCompletionDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Payment Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {plan.schedule && plan.schedule.length > 0 ? (
                plan.schedule.map((item, index) => {
                  const itemConfig = scheduleStatusConfig[item.status] || scheduleStatusConfig.pending;
                  const ItemIcon = itemConfig.icon;
                  const isNextDue = item.status === 'pending' && 
                    plan.schedule.findIndex(i => i.status === 'pending') === index;
                  
                  return (
                    <div
                      key={item.id || index}
                      className={`flex items-center justify-between p-4 rounded-md border ${
                        isNextDue ? 'border-primary bg-primary/5' : ''
                      }`}
                      data-testid={`payment-item-${index}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          item.status === 'paid' 
                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                            : item.status === 'overdue'
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          <ItemIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.dueDate && (
                            <p className="text-sm text-muted-foreground">
                              Due: {formatDate(item.dueDate)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-semibold">{formatCurrency(item.amount)}</p>
                          <Badge variant={itemConfig.variant}>
                            {itemConfig.label}
                          </Badge>
                        </div>
                        {item.status !== 'paid' && (
                          <Button
                            size="sm"
                            onClick={() => initiatePayment.mutate(item.id)}
                            disabled={initiatePayment.isPending}
                            data-testid={`button-pay-${index}`}
                          >
                            {initiatePayment.isPending ? "..." : "Pay"}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No payment schedule items yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="h-5 w-5" />
                Need More Services?
              </CardTitle>
              <CardDescription>
                Request additional tree care services while we're working on your property.
              </CardDescription>
            </div>
            <Button
              onClick={() => setIsServiceDialogOpen(true)}
              data-testid="button-request-service"
            >
              <Plus className="h-4 w-4 mr-2" />
              Request Service
            </Button>
          </CardHeader>
          {serviceRequests.length > 0 && (
            <CardContent>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Your Requests
                </h4>
                {serviceRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 rounded-md border"
                    data-testid={`service-request-${req.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Send className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {req.title || getCategoryLabel(req.category)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {req.requestNumber} - {formatDate(req.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {req.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {company && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Us</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium">{company.name}</p>
                {company.phone && (
                  <a href={`tel:${company.phone}`} className="text-primary hover:underline">
                    {company.phone}
                  </a>
                )}
                {company.email && (
                  <a href={`mailto:${company.email}`} className="text-primary hover:underline">
                    {company.email}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Request Additional Service</DialogTitle>
              <DialogDescription>
                Tell us what other tree care services you need. We'll get back to you with a quote.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="category">Service Type *</Label>
                <Select value={serviceCategory} onValueChange={setServiceCategory}>
                  <SelectTrigger id="category" data-testid="select-service-category">
                    <SelectValue placeholder="Select a service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceCategories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <cat.icon className="h-4 w-4" />
                          {cat.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Brief Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Remove oak tree in backyard"
                  value={serviceTitle}
                  onChange={(e) => setServiceTitle(e.target.value)}
                  data-testid="input-service-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Provide details about the service you need..."
                  rows={3}
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  data-testid="input-service-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeframe">Preferred Timeframe</Label>
                <Input
                  id="timeframe"
                  placeholder="e.g., Next month, ASAP, Anytime"
                  value={preferredTimeframe}
                  onChange={(e) => setPreferredTimeframe(e.target.value)}
                  data-testid="input-service-timeframe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="urgency">Urgency</Label>
                <Select value={urgency} onValueChange={setUrgency}>
                  <SelectTrigger id="urgency" data-testid="select-service-urgency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low - No rush</SelectItem>
                    <SelectItem value="normal">Normal - Standard scheduling</SelectItem>
                    <SelectItem value="high">High - Soon as possible</SelectItem>
                    <SelectItem value="emergency">Emergency - Immediate attention needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsServiceDialogOpen(false);
                    resetServiceForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitService}
                  disabled={submitServiceRequest.isPending}
                  data-testid="button-submit-service"
                >
                  {submitServiceRequest.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
