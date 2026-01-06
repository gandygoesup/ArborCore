import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Plus,
  Megaphone,
  Eye,
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Edit2,
  Trash2,
  MoreVertical,
  FileText,
  Users,
  TrendingUp,
  Link2,
  ArrowRight,
  Calculator,
  Calendar,
  FileSignature,
  CreditCard,
  Wrench,
  Building2,
} from "lucide-react";
import { FeatureStatusBadge, FeatureStatusLegend, type FeatureStatus } from "@/components/FeatureStatusBadge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MarketingPage, MarketingCampaign, LeadSource } from "@shared/schema";

interface MarketingStats {
  activeCampaigns: number;
  livePages: number;
  totalSubmissions: number;
  totalLeadsGenerated: number;
  totalViews: number;
  conversionRate: string;
}

export default function Marketing() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    campaignId: "",
    leadSourceId: "",
    headline: "Get Your Free Estimate",
    subheadline: "Fill out the form below and we'll get back to you within 24 hours.",
  });

  const { data: stats, isLoading: statsLoading } = useQuery<MarketingStats>({
    queryKey: ['/api/marketing/stats'],
  });

  const { data: pages, isLoading: pagesLoading } = useQuery<MarketingPage[]>({
    queryKey: ['/api/marketing/pages'],
  });

  const { data: campaigns } = useQuery<MarketingCampaign[]>({
    queryKey: ['/api/marketing/campaigns'],
  });

  const { data: leadSources } = useQuery<LeadSource[]>({
    queryKey: ['/api/lead-sources'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload: any = {
        title: data.title,
        headline: data.headline,
        description: data.subheadline,
        inputFields: [
          { name: "firstName", label: "First Name", type: "text", required: true },
          { name: "lastName", label: "Last Name", type: "text", required: false },
          { name: "email", label: "Email", type: "email", required: true },
          { name: "phone", label: "Phone", type: "tel", required: true },
          { name: "address", label: "Address", type: "text", required: false },
          { name: "notes", label: "How can we help?", type: "textarea", required: false },
        ],
        ctaText: "Get My Free Estimate",
        thankYouMessage: "Thanks! We'll be in touch within 24 hours.",
      };
      if (data.campaignId) payload.campaignId = data.campaignId;
      if (data.leadSourceId) payload.leadSourceId = data.leadSourceId;
      const response = await apiRequest("POST", "/api/marketing/pages", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/pages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/stats'] });
      toast({ title: "Marketing page created", description: "Your page is ready to publish." });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/marketing/pages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/pages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/stats'] });
      toast({ title: "Page deleted" });
      setDeletePageId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/marketing/pages/${id}`, { status: "live" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/pages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/stats'] });
      toast({ title: "Page published", description: "Your marketing page is now live." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      campaignId: "",
      leadSourceId: "",
      headline: "Get Your Free Estimate",
      subheadline: "Fill out the form below and we'll get back to you within 24 hours.",
    });
  };

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/m/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "live":
        return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Live</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "archived":
        return <Badge variant="outline" className="text-muted-foreground">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4 pb-24 md:pb-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-heading">Marketing</h1>
            <p className="text-muted-foreground mt-1">Create landing pages and track lead attribution</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-page">
            <Plus className="h-4 w-4 mr-2" />
            New Page
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Live Pages</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold" data-testid="stat-live-pages">{stats?.livePages || 0}</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Views</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold" data-testid="stat-total-views">{stats?.totalViews || 0}</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Leads Generated</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold" data-testid="stat-leads">{stats?.totalLeadsGenerated || 0}</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                  {statsLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold" data-testid="stat-conversion">{stats?.conversionRate || "0%"}</p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Marketing Pages</CardTitle>
              <CardDescription>Tracked landing pages that capture leads with attribution</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {pagesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : pages?.length === 0 ? (
              <div className="text-center py-12">
                <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium mb-1">No marketing pages yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first page to start capturing leads</p>
                <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-page">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Page
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {pages?.map(page => (
                  <div
                    key={page.id}
                    className="flex items-center justify-between p-4 rounded-md border hover-elevate gap-4"
                    data-testid={`row-page-${page.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{page.title}</p>
                        {getStatusBadge(page.status)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-1">{page.headline}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {page.viewCount} views
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {page.submissionCount} leads
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {page.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => publishMutation.mutate(page.id)}
                          disabled={publishMutation.isPending}
                          data-testid={`button-publish-${page.id}`}
                        >
                          Publish
                        </Button>
                      )}
                      {page.status === "live" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyLink(page.magicToken)}
                            data-testid={`button-copy-link-${page.id}`}
                          >
                            {copiedToken === page.magicToken ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            data-testid={`button-preview-${page.id}`}
                          >
                            <a href={`/m/${page.magicToken}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-menu-${page.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/marketing/${page.id}`)}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/marketing/${page.id}/analytics`)}>
                            <BarChart3 className="h-4 w-4 mr-2" />
                            Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletePageId(page.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Marketing Page</DialogTitle>
              <DialogDescription>
                Create a tracked landing page that captures leads with attribution
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(formData); }}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="page-name">Page Name</Label>
                  <Input
                    id="page-name"
                    value={formData.title}
                    onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., Spring Storm Cleanup"
                    required
                    data-testid="input-page-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="page-headline">Headline</Label>
                  <Input
                    id="page-headline"
                    value={formData.headline}
                    onChange={e => setFormData(prev => ({ ...prev, headline: e.target.value }))}
                    placeholder="Get Your Free Estimate"
                    data-testid="input-page-headline"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="page-subheadline">Subheadline</Label>
                  <Input
                    id="page-subheadline"
                    value={formData.subheadline}
                    onChange={e => setFormData(prev => ({ ...prev, subheadline: e.target.value }))}
                    placeholder="Fill out the form below..."
                    data-testid="input-page-subheadline"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="page-campaign">Campaign</Label>
                    <Select
                      value={formData.campaignId}
                      onValueChange={value => setFormData(prev => ({ ...prev, campaignId: value }))}
                    >
                      <SelectTrigger data-testid="select-campaign">
                        <SelectValue placeholder="Select campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns?.map(campaign => (
                          <SelectItem key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="page-source">Lead Source</Label>
                    <Select
                      value={formData.leadSourceId}
                      onValueChange={value => setFormData(prev => ({ ...prev, leadSourceId: value }))}
                    >
                      <SelectTrigger data-testid="select-lead-source">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {leadSources?.map(source => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-page-submit">
                  Create Page
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deletePageId} onOpenChange={() => setDeletePageId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Marketing Page</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this marketing page and all its analytics. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletePageId && deleteMutation.mutate(deletePageId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-page"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Platform Roadmap</CardTitle>
                <CardDescription>ArborCore capabilities and development status</CardDescription>
              </div>
              <FeatureStatusLegend />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Now (Live)</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <RoadmapCard
                    icon={Calculator}
                    title="Cost-of-Operation Pricing"
                    description="Estimate pricing derived from real labor, equipment, and overhead costs. Configurable specs for tree size, risk, cleanup, and access."
                    status="live"
                  />
                  <RoadmapCard
                    icon={Link2}
                    title="Estimates via Magic Link"
                    description="Customers review and approve estimates through a secure, branded link. Reduces back-and-forth communication."
                    status="live"
                  />
                  <RoadmapCard
                    icon={Building2}
                    title="Customer & Property Management"
                    description="Track leads and customers in one place with notes, job history, and property details."
                    status="live"
                  />
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Next (In Progress)</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <RoadmapCard
                    icon={Calendar}
                    title="Conflict-Aware Scheduling"
                    description="Being built to coordinate crew and equipment assignments with conflict detection and enforcement."
                    status="in_progress"
                  />
                  <RoadmapCard
                    icon={CreditCard}
                    title="Billing & Payment Plans"
                    description="Currently adding invoicing, deposits, and payment plan workflows with integrated payment processing."
                    status="in_progress"
                  />
                  <RoadmapCard
                    icon={FileSignature}
                    title="Contract Generation"
                    description="In development to generate contracts from approved estimates with digital signature support."
                    status="in_progress"
                  />
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">Planned</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <RoadmapCard
                    icon={Wrench}
                    title="Equipment Intelligence"
                    description="Will track equipment usage, operating costs, and maintenance scheduling requirements."
                    status="planned"
                  />
                  <RoadmapCard
                    icon={Megaphone}
                    title="Automated Reminders"
                    description="Planned to deliver payment reminders and follow-up messages automatically."
                    status="planned"
                  />
                  <RoadmapCard
                    icon={BarChart3}
                    title="Advanced Marketing Analytics"
                    description="Will provide attribution tracking from marketing source through revenue with ROI reporting."
                    status="planned"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t text-center">
              <p className="text-sm text-muted-foreground">
                We build features in the order they protect margin, cash flow, and scheduling reality.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface RoadmapCardProps {
  icon: typeof Calculator;
  title: string;
  description: string;
  status: FeatureStatus;
}

function RoadmapCard({ icon: Icon, title, description, status }: RoadmapCardProps) {
  return (
    <div className="p-4 rounded-md border" data-testid={`card-feature-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <FeatureStatusBadge status={status} />
      </div>
      <h4 className="font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
