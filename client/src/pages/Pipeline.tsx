import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Phone, 
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  ChevronRight,
  Users,
  DollarSign,
  TrendingUp,
  AlertCircle
} from "lucide-react";

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
};

type Estimate = {
  id: string;
  title: string;
  status: string;
  totalPrice: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
  createdAt: string;
};

const statusStyles: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  draft: { bg: "bg-muted", text: "text-muted-foreground", icon: Clock },
  sent: { bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-700 dark:text-blue-300", icon: Send },
  approved: { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-300", icon: CheckCircle },
  declined: { bg: "bg-red-100 dark:bg-red-900/50", text: "text-red-700 dark:text-red-300", icon: XCircle },
};

const leadStyles: Record<string, { bg: string; text: string }> = {
  new: { bg: "bg-blue-100 dark:bg-blue-900/50", text: "text-blue-700 dark:text-blue-300" },
  contacted: { bg: "bg-yellow-100 dark:bg-yellow-900/50", text: "text-yellow-700 dark:text-yellow-300" },
  qualified: { bg: "bg-green-100 dark:bg-green-900/50", text: "text-green-700 dark:text-green-300" },
  converted: { bg: "bg-purple-100 dark:bg-purple-900/50", text: "text-purple-700 dark:text-purple-300" },
  lost: { bg: "bg-muted", text: "text-muted-foreground" },
};

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function MetricCard({ 
  label, 
  value, 
  icon: Icon, 
  trend 
}: { 
  label: string; 
  value: string | number; 
  icon: typeof Users; 
  trend?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className="p-2 rounded-md bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-semibold" data-testid={`metric-${label.toLowerCase().replace(/\s/g, "-")}`}>
          {value}
        </p>
      </div>
      {trend && (
        <Badge variant="secondary" className="ml-auto text-xs">
          {trend}
        </Badge>
      )}
    </div>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const style = leadStyles[lead.status] || leadStyles.new;
  
  return (
    <div 
      className="flex items-center gap-3 p-3 border-b last:border-b-0 hover-elevate"
      data-testid={`row-lead-${lead.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">
            {lead.firstName} {lead.lastName}
          </span>
          <Badge variant="secondary" className={`${style.bg} ${style.text} text-xs`}>
            {lead.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {lead.address && <span className="truncate max-w-[150px]">{lead.address}</span>}
          <span>{getTimeAgo(lead.createdAt)}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        {lead.phone && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              asChild
              data-testid={`button-call-lead-${lead.id}`}
            >
              <a href={`tel:${lead.phone}`}>
                <Phone className="h-4 w-4" />
              </a>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              asChild
              data-testid={`button-text-lead-${lead.id}`}
            >
              <a href={`sms:${lead.phone}`}>
                <MessageSquare className="h-4 w-4" />
              </a>
            </Button>
          </>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          asChild
          data-testid={`button-estimate-lead-${lead.id}`}
        >
          <Link href={`/estimates/new?leadId=${lead.id}`}>
            <FileText className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function EstimateRow({ estimate }: { estimate: Estimate }) {
  const style = statusStyles[estimate.status] || statusStyles.draft;
  const Icon = style.icon;
  const price = parseFloat(estimate.totalPrice || "0");
  
  return (
    <Link href={`/estimates/${estimate.id}`} data-testid={`link-estimate-${estimate.id}`}>
      <div 
        className="flex items-center gap-3 p-3 border-b last:border-b-0 hover-elevate cursor-pointer"
        data-testid={`row-estimate-${estimate.id}`}
      >
        <div className={`p-2 rounded-md ${style.bg}`}>
          <Icon className={`h-4 w-4 ${style.text}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">
              {estimate.customer 
                ? `${estimate.customer.firstName} ${estimate.customer.lastName}`
                : estimate.title
              }
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate max-w-[150px]">{estimate.title}</span>
            <span>{getTimeAgo(estimate.createdAt)}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">
            ${price.toLocaleString()}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ 
  title, 
  description, 
  action 
}: { 
  title: string; 
  description: string; 
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-4" />
      <h3 className="font-medium text-muted-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground/70 mb-4">{description}</p>
      {action && (
        <Button variant="outline" size="sm" asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 border-b">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function Pipeline() {
  const [activeTab, setActiveTab] = useState("estimates");
  
  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: estimates = [], isLoading: estimatesLoading } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates"],
  });

  const activeLeads = leads.filter(l => !["converted", "lost"].includes(l.status));
  const draftEstimates = estimates.filter(e => e.status === "draft");
  const sentEstimates = estimates.filter(e => e.status === "sent");
  const approvedEstimates = estimates.filter(e => e.status === "approved");
  const declinedEstimates = estimates.filter(e => e.status === "declined");
  
  const totalPipelineValue = [...draftEstimates, ...sentEstimates].reduce(
    (sum, e) => sum + parseFloat(e.totalPrice || "0"), 
    0
  );
  const wonValue = approvedEstimates.reduce(
    (sum, e) => sum + parseFloat(e.totalPrice || "0"), 
    0
  );

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold mb-4" data-testid="text-page-title">Pipeline</h1>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard 
            label="Active Leads" 
            value={activeLeads.length} 
            icon={Users} 
          />
          <MetricCard 
            label="Open Estimates" 
            value={draftEstimates.length + sentEstimates.length} 
            icon={FileText} 
          />
          <MetricCard 
            label="Pipeline Value" 
            value={`$${totalPipelineValue.toLocaleString()}`} 
            icon={DollarSign} 
          />
          <MetricCard 
            label="Won This Month" 
            value={`$${wonValue.toLocaleString()}`} 
            icon={TrendingUp} 
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="border-b px-4">
          <TabsList className="h-12 w-full justify-start bg-transparent p-0 gap-4">
            <TabsTrigger 
              value="estimates" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 pb-3"
              data-testid="tab-estimates"
            >
              Estimates
              <Badge variant="secondary" className="ml-2">
                {draftEstimates.length + sentEstimates.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="leads" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 pb-3"
              data-testid="tab-leads"
            >
              Leads
              <Badge variant="secondary" className="ml-2">
                {activeLeads.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="won" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 pb-3"
              data-testid="tab-won"
            >
              Won
              <Badge variant="secondary" className="ml-2">
                {approvedEstimates.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="lost" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none px-0 pb-3"
              data-testid="tab-lost"
            >
              Lost
              <Badge variant="secondary" className="ml-2">
                {declinedEstimates.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="estimates" className="m-0 h-full">
            <div className="divide-y">
              {sentEstimates.length > 0 && (
                <div>
                  <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-4 py-2 flex items-center gap-2">
                    <Send className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Awaiting Response ({sentEstimates.length})
                    </span>
                  </div>
                  {estimatesLoading ? <LoadingSkeleton /> : (
                    sentEstimates.map(e => <EstimateRow key={e.id} estimate={e} />)
                  )}
                </div>
              )}
              
              {draftEstimates.length > 0 && (
                <div>
                  <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-4 py-2 flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Drafts ({draftEstimates.length})
                    </span>
                  </div>
                  {estimatesLoading ? <LoadingSkeleton /> : (
                    draftEstimates.map(e => <EstimateRow key={e.id} estimate={e} />)
                  )}
                </div>
              )}
              
              {!estimatesLoading && sentEstimates.length === 0 && draftEstimates.length === 0 && (
                <EmptyState 
                  title="No open estimates" 
                  description="Create an estimate from a lead or start fresh"
                  action={{ label: "New Estimate", href: "/estimates/new" }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="leads" className="m-0 h-full">
            {leadsLoading ? (
              <LoadingSkeleton />
            ) : activeLeads.length === 0 ? (
              <EmptyState 
                title="No active leads" 
                description="Add leads from your marketing or referrals"
                action={{ label: "Add Lead", href: "/leads/new" }}
              />
            ) : (
              <div>
                {activeLeads.map(lead => <LeadRow key={lead.id} lead={lead} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="won" className="m-0 h-full">
            {estimatesLoading ? (
              <LoadingSkeleton />
            ) : approvedEstimates.length === 0 ? (
              <EmptyState 
                title="No won estimates yet" 
                description="Approved estimates will appear here"
              />
            ) : (
              <div>
                {approvedEstimates.map(e => <EstimateRow key={e.id} estimate={e} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="lost" className="m-0 h-full">
            {estimatesLoading ? (
              <LoadingSkeleton />
            ) : declinedEstimates.length === 0 ? (
              <EmptyState 
                title="No declined estimates" 
                description="Declined estimates will appear here for follow-up"
              />
            ) : (
              <div>
                {declinedEstimates.map(e => <EstimateRow key={e.id} estimate={e} />)}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
