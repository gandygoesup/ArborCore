import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Link2,
  Plus,
  Settings,
  Trash2,
  Eye,
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Edit2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PricingTool } from "@shared/schema";

interface PricingToolConfig {
  basePrice: number;
  heightMultipliers: {
    small: number;
    medium: number;
    large: number;
    xl: number;
  };
  hazardMultiplier: number;
  stumpGrindingAddon: number;
  headline?: string;
  description?: string;
  thankYouMessage?: string;
  primaryColor?: string;
}

const defaultConfig: PricingToolConfig = {
  basePrice: 500,
  heightMultipliers: {
    small: 0.6,
    medium: 1.0,
    large: 1.8,
    xl: 3.0,
  },
  hazardMultiplier: 1.25,
  stumpGrindingAddon: 150,
  headline: "Get Your Free Tree Service Quote",
  description: "Answer a few questions and get an instant estimate for your tree work.",
  thankYouMessage: "Thanks! We'll be in touch shortly to discuss your project.",
  primaryColor: "#16a34a",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export default function PricingToolsSettings() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteToolId, setDeleteToolId] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<PricingTool | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    isPublic: true,
    isActive: true,
    config: { ...defaultConfig },
  });

  const { data: tools, isLoading } = useQuery<PricingTool[]>({
    queryKey: ['/api/pricing-tools'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/pricing-tools", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing-tools'] });
      toast({ title: "Pricing tool created", description: "Your new quote form is ready to share." });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PATCH", `/api/pricing-tools/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing-tools'] });
      toast({ title: "Pricing tool updated", description: "Your changes have been saved." });
      setIsEditOpen(false);
      setEditingTool(null);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pricing-tools/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing-tools'] });
      toast({ title: "Pricing tool deleted", description: "The quote form has been removed." });
      setDeleteToolId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      isPublic: true,
      isActive: true,
      config: { ...defaultConfig },
    });
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: slugify(name),
    }));
  };

  const handleEditTool = (tool: PricingTool) => {
    setEditingTool(tool);
    const toolConfig = tool.config as PricingToolConfig;
    setFormData({
      name: tool.name,
      slug: tool.slug,
      description: tool.description || "",
      isPublic: tool.isPublic,
      isActive: tool.isActive,
      config: { ...defaultConfig, ...toolConfig },
    });
    setIsEditOpen(true);
  };

  const getQuoteUrl = (slug: string) => {
    return `${window.location.origin}/quote/${slug}`;
  };

  const copyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(getQuoteUrl(slug));
      setCopiedSlug(slug);
      toast({ title: "Link copied!", description: "Share this link on social media, emails, or texts." });
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleCreate = () => {
    if (!formData.name || !formData.slug) {
      toast({ title: "Error", description: "Name and URL slug are required", variant: "destructive" });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingTool || !formData.name || !formData.slug) {
      toast({ title: "Error", description: "Name and URL slug are required", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingTool.id, data: formData });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Quote Landing Pages</h1>
          <p className="text-muted-foreground mt-1">
            Create shareable quote forms for marketing campaigns, social media, and customer outreach.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-pricing-tool">
              <Plus className="h-4 w-4 mr-2" />
              Create Quote Page
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Quote Landing Page</DialogTitle>
              <DialogDescription>
                Set up a new public quote form that customers can access via a unique link.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Page Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Spring Special 2024"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  data-testid="input-tool-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">/quote/</span>
                  <Input
                    id="slug"
                    placeholder="spring-special-2024"
                    value={formData.slug}
                    onChange={(e) => setFormData(prev => ({ ...prev, slug: slugify(e.target.value) }))}
                    data-testid="input-tool-slug"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="headline">Headline</Label>
                <Input
                  id="headline"
                  placeholder="Get Your Free Tree Service Quote"
                  value={formData.config.headline}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    config: { ...prev.config, headline: e.target.value }
                  }))}
                  data-testid="input-tool-headline"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Answer a few questions and get an instant estimate..."
                  value={formData.config.description}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    config: { ...prev.config, description: e.target.value }
                  }))}
                  data-testid="input-tool-description"
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <h4 className="font-medium">Pricing Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basePrice">Base Price ($)</Label>
                    <Input
                      id="basePrice"
                      type="number"
                      value={formData.config.basePrice}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        config: { ...prev.config, basePrice: parseInt(e.target.value) || 500 }
                      }))}
                      data-testid="input-base-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stumpAddon">Stump Grinding Add-on ($)</Label>
                    <Input
                      id="stumpAddon"
                      type="number"
                      value={formData.config.stumpGrindingAddon}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        config: { ...prev.config, stumpGrindingAddon: parseInt(e.target.value) || 150 }
                      }))}
                      data-testid="input-stump-addon"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Hazard Multiplier</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.05"
                      value={formData.config.hazardMultiplier}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        config: { ...prev.config, hazardMultiplier: parseFloat(e.target.value) || 1.25 }
                      }))}
                      className="w-24"
                      data-testid="input-hazard-multiplier"
                    />
                    <span className="text-sm text-muted-foreground">x base price for hazard trees</span>
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Public Access</Label>
                  <p className="text-sm text-muted-foreground">Allow anyone with the link to submit quotes</p>
                </div>
                <Switch
                  checked={formData.isPublic}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPublic: checked }))}
                  data-testid="switch-is-public"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                data-testid="button-save-tool"
              >
                {createMutation.isPending ? "Creating..." : "Create Quote Page"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tools && tools.length > 0 ? (
        <div className="grid gap-4">
          {tools.map((tool) => {
            const config = tool.config as PricingToolConfig;
            return (
              <Card key={tool.id} data-testid={`card-pricing-tool-${tool.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{tool.name}</CardTitle>
                        {tool.isActive ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {!tool.isPublic && (
                          <Badge variant="outline">Private</Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        {config.headline || "Get Your Free Quote"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditTool(tool)}
                        data-testid={`button-edit-tool-${tool.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteToolId(tool.id)}
                        data-testid={`button-delete-tool-${tool.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <code className="text-sm flex-1 truncate">{getQuoteUrl(tool.slug)}</code>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyLink(tool.slug)}
                        data-testid={`button-copy-link-${tool.id}`}
                      >
                        {copiedSlug === tool.slug ? (
                          <Check className="h-4 w-4 mr-1" />
                        ) : (
                          <Copy className="h-4 w-4 mr-1" />
                        )}
                        Copy Link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        data-testid={`button-preview-tool-${tool.id}`}
                      >
                        <a href={getQuoteUrl(tool.slug)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Preview
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-4 w-4" />
                      <span>{tool.viewCount || 0} views</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4" />
                      <span>{tool.submissionCount || 0} submissions</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Settings className="h-4 w-4" />
                      <span>Base: ${config.basePrice || 500}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No quote pages yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Create a shareable quote form to start collecting leads from social media, emails, and marketing campaigns.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-tool">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Quote Page
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setEditingTool(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Quote Page</DialogTitle>
            <DialogDescription>
              Update your quote form settings and pricing configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Page Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-edit-tool-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/quote/</span>
                <Input
                  id="edit-slug"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: slugify(e.target.value) }))}
                  data-testid="input-edit-tool-slug"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-headline">Headline</Label>
              <Input
                id="edit-headline"
                value={formData.config.headline}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, headline: e.target.value }
                }))}
                data-testid="input-edit-tool-headline"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.config.description}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, description: e.target.value }
                }))}
                data-testid="input-edit-tool-description"
              />
            </div>
            <Separator />
            <div className="space-y-4">
              <h4 className="font-medium">Pricing Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Base Price ($)</Label>
                  <Input
                    type="number"
                    value={formData.config.basePrice}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      config: { ...prev.config, basePrice: parseInt(e.target.value) || 500 }
                    }))}
                    data-testid="input-edit-base-price"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Stump Grinding Add-on ($)</Label>
                  <Input
                    type="number"
                    value={formData.config.stumpGrindingAddon}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      config: { ...prev.config, stumpGrindingAddon: parseInt(e.target.value) || 150 }
                    }))}
                    data-testid="input-edit-stump-addon"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Hazard Multiplier</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.05"
                    value={formData.config.hazardMultiplier}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      config: { ...prev.config, hazardMultiplier: parseFloat(e.target.value) || 1.25 }
                    }))}
                    className="w-24"
                    data-testid="input-edit-hazard-multiplier"
                  />
                  <span className="text-sm text-muted-foreground">x base price</span>
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-sm text-muted-foreground">Enable or disable this quote page</p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                data-testid="switch-edit-is-active"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Public Access</Label>
                <p className="text-sm text-muted-foreground">Allow anyone with the link</p>
              </div>
              <Switch
                checked={formData.isPublic}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPublic: checked }))}
                data-testid="switch-edit-is-public"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              data-testid="button-update-tool"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteToolId} onOpenChange={(open) => !open && setDeleteToolId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quote page?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the quote page and its shareable link. Any existing leads from this page will remain in your system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteToolId && deleteMutation.mutate(deleteToolId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
