import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Trash2,
  Edit2,
  Tag,
  Megaphone,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LeadSource, MarketingCampaign } from "@shared/schema";

export default function SettingsMarketing() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"sources" | "campaigns">("sources");

  const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);
  const [sourceForm, setSourceForm] = useState({ name: "", description: "" });

  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [deleteCampaignId, setDeleteCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", startDate: "", endDate: "", budget: "" });

  const { data: leadSources, isLoading: sourcesLoading } = useQuery<LeadSource[]>({
    queryKey: ['/api/lead-sources'],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<MarketingCampaign[]>({
    queryKey: ['/api/marketing/campaigns'],
  });

  const createSourceMutation = useMutation({
    mutationFn: async (data: typeof sourceForm) => {
      const response = await apiRequest("POST", "/api/lead-sources", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-sources'] });
      toast({ title: "Lead source created" });
      setIsSourceDialogOpen(false);
      resetSourceForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSourceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof sourceForm }) => {
      const response = await apiRequest("PATCH", `/api/lead-sources/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-sources'] });
      toast({ title: "Lead source updated" });
      setIsSourceDialogOpen(false);
      setEditingSource(null);
      resetSourceForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/lead-sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-sources'] });
      toast({ title: "Lead source deleted" });
      setDeleteSourceId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: typeof campaignForm) => {
      const payload: any = { name: data.name, description: data.description || undefined };
      if (data.startDate) payload.startDate = new Date(data.startDate);
      if (data.endDate) payload.endDate = new Date(data.endDate);
      if (data.budget) payload.budget = data.budget;
      const response = await apiRequest("POST", "/api/marketing/campaigns", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/campaigns'] });
      toast({ title: "Campaign created" });
      setIsCampaignDialogOpen(false);
      resetCampaignForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof campaignForm }) => {
      const payload: any = { name: data.name, description: data.description || undefined };
      if (data.startDate) payload.startDate = new Date(data.startDate);
      if (data.endDate) payload.endDate = new Date(data.endDate);
      if (data.budget) payload.budget = data.budget;
      const response = await apiRequest("PATCH", `/api/marketing/campaigns/${id}`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/campaigns'] });
      toast({ title: "Campaign updated" });
      setIsCampaignDialogOpen(false);
      setEditingCampaign(null);
      resetCampaignForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/marketing/campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/marketing/campaigns'] });
      toast({ title: "Campaign deleted" });
      setDeleteCampaignId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetSourceForm = () => {
    setSourceForm({ name: "", description: "" });
  };

  const resetCampaignForm = () => {
    setCampaignForm({ name: "", description: "", startDate: "", endDate: "", budget: "" });
  };

  const handleEditSource = (source: LeadSource) => {
    setEditingSource(source);
    setSourceForm({
      name: source.name,
      description: source.description || "",
    });
    setIsSourceDialogOpen(true);
  };

  const handleEditCampaign = (campaign: MarketingCampaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      description: campaign.description || "",
      startDate: campaign.startDate ? new Date(campaign.startDate).toISOString().split('T')[0] : "",
      endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().split('T')[0] : "",
      budget: campaign.budgetAmount || "",
    });
    setIsCampaignDialogOpen(true);
  };

  const handleSourceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSource) {
      updateSourceMutation.mutate({ id: editingSource.id, data: sourceForm });
    } else {
      createSourceMutation.mutate(sourceForm);
    }
  };

  const handleCampaignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCampaign) {
      updateCampaignMutation.mutate({ id: editingCampaign.id, data: campaignForm });
    } else {
      createCampaignMutation.mutate(campaignForm);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-4 pb-24 md:pb-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-heading">Marketing Settings</h1>
          <p className="text-muted-foreground mt-1">Configure lead sources and campaign templates</p>
        </div>

        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("sources")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "sources"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-sources"
          >
            <Tag className="h-4 w-4 inline mr-2" />
            Lead Sources
          </button>
          <button
            onClick={() => setActiveTab("campaigns")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "campaigns"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-campaigns"
          >
            <Megaphone className="h-4 w-4 inline mr-2" />
            Campaigns
          </button>
        </div>

        {activeTab === "sources" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Lead Sources
                </CardTitle>
                <CardDescription>
                  Define where your leads come from for attribution tracking
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingSource(null);
                  resetSourceForm();
                  setIsSourceDialogOpen(true);
                }}
                data-testid="button-add-source"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Source
              </Button>
            </CardHeader>
            <CardContent>
              {sourcesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : leadSources?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No lead sources configured yet
                </div>
              ) : (
                <div className="space-y-2">
                  {leadSources?.map(source => (
                    <div
                      key={source.id}
                      className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                      data-testid={`row-source-${source.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full bg-blue-500"
                        />
                        <div>
                          <p className="font-medium">{source.name}</p>
                          {source.description && (
                            <p className="text-sm text-muted-foreground">{source.description}</p>
                          )}
                        </div>
                        {source.isDefault && (
                          <Badge variant="secondary" className="ml-2">Default</Badge>
                        )}
                      </div>
                      {!source.isDefault && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditSource(source)}
                            data-testid={`button-edit-source-${source.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteSourceId(source.id)}
                            data-testid={`button-delete-source-${source.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "campaigns" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Marketing Campaigns
                </CardTitle>
                <CardDescription>
                  Create and manage marketing campaigns for attribution
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setEditingCampaign(null);
                  resetCampaignForm();
                  setIsCampaignDialogOpen(true);
                }}
                data-testid="button-add-campaign"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Campaign
              </Button>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : campaigns?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No campaigns configured yet
                </div>
              ) : (
                <div className="space-y-2">
                  {campaigns?.map(campaign => (
                    <div
                      key={campaign.id}
                      className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                      data-testid={`row-campaign-${campaign.id}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{campaign.name}</p>
                          <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                            {campaign.status}
                          </Badge>
                        </div>
                        {campaign.description && (
                          <p className="text-sm text-muted-foreground">{campaign.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          {campaign.startDate && (
                            <span>Start: {new Date(campaign.startDate).toLocaleDateString()}</span>
                          )}
                          {campaign.endDate && (
                            <span>End: {new Date(campaign.endDate).toLocaleDateString()}</span>
                          )}
                          {campaign.budgetAmount && (
                            <span>Budget: ${campaign.budgetAmount}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditCampaign(campaign)}
                          data-testid={`button-edit-campaign-${campaign.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteCampaignId(campaign.id)}
                          data-testid={`button-delete-campaign-${campaign.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={isSourceDialogOpen} onOpenChange={setIsSourceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSource ? "Edit Lead Source" : "Add Lead Source"}</DialogTitle>
              <DialogDescription>
                Define a source for tracking where leads originate
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSourceSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="source-name">Name</Label>
                  <Input
                    id="source-name"
                    value={sourceForm.name}
                    onChange={e => setSourceForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Facebook Ads"
                    required
                    data-testid="input-source-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-description">Description</Label>
                  <Input
                    id="source-description"
                    value={sourceForm.description}
                    onChange={e => setSourceForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    data-testid="input-source-description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsSourceDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createSourceMutation.isPending || updateSourceMutation.isPending}
                  data-testid="button-save-source"
                >
                  {editingSource ? "Save Changes" : "Add Source"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCampaign ? "Edit Campaign" : "Add Campaign"}</DialogTitle>
              <DialogDescription>
                Create a campaign for grouping marketing efforts
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCampaignSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Name</Label>
                  <Input
                    id="campaign-name"
                    value={campaignForm.name}
                    onChange={e => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Spring 2026 Promo"
                    required
                    data-testid="input-campaign-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-description">Description</Label>
                  <Input
                    id="campaign-description"
                    value={campaignForm.description}
                    onChange={e => setCampaignForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    data-testid="input-campaign-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="campaign-start">Start Date</Label>
                    <Input
                      id="campaign-start"
                      type="date"
                      value={campaignForm.startDate}
                      onChange={e => setCampaignForm(prev => ({ ...prev, startDate: e.target.value }))}
                      data-testid="input-campaign-start"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="campaign-end">End Date</Label>
                    <Input
                      id="campaign-end"
                      type="date"
                      value={campaignForm.endDate}
                      onChange={e => setCampaignForm(prev => ({ ...prev, endDate: e.target.value }))}
                      data-testid="input-campaign-end"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-budget">Budget</Label>
                  <Input
                    id="campaign-budget"
                    type="number"
                    step="0.01"
                    value={campaignForm.budget}
                    onChange={e => setCampaignForm(prev => ({ ...prev, budget: e.target.value }))}
                    placeholder="Optional budget amount"
                    data-testid="input-campaign-budget"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCampaignDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createCampaignMutation.isPending || updateCampaignMutation.isPending}
                  data-testid="button-save-campaign"
                >
                  {editingCampaign ? "Save Changes" : "Add Campaign"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteSourceId} onOpenChange={() => setDeleteSourceId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Lead Source</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this lead source. Existing leads with this source will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteSourceId && deleteSourceMutation.mutate(deleteSourceId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-source"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteCampaignId} onOpenChange={() => setDeleteCampaignId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this campaign. Marketing pages using this campaign will be unaffected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteCampaignId && deleteCampaignMutation.mutate(deleteCampaignId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-campaign"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
