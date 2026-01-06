import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Settings2, 
  FileText, 
  Calculator,
  GripVertical,
  CheckCircle,
  DollarSign,
  Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EstimateField, PricingProfile, PricingRule, EstimateToolConfigData, EstimateToolConfig } from "@shared/schema";

const fieldTypes = [
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Dropdown" },
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
];

const effectTypes = [
  { value: "flat", label: "Flat Amount ($)" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "multiplier", label: "Multiplier (x)" },
  { value: "perUnit", label: "Per Unit ($)" },
];

export default function EstimateSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("fields");

  const { data: fields = [], isLoading: fieldsLoading } = useQuery<EstimateField[]>({
    queryKey: ["/api/estimate-fields"],
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery<PricingProfile[]>({
    queryKey: ["/api/pricing-profiles"],
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<PricingRule[]>({
    queryKey: ["/api/pricing-rules"],
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Estimate Configuration</h1>
          <p className="text-muted-foreground">
            Configure fields, pricing rules, and profiles for your estimates
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="fields" data-testid="tab-fields">
            <FileText className="w-4 h-4 mr-2" />
            Fields
          </TabsTrigger>
          <TabsTrigger value="profiles" data-testid="tab-profiles">
            <Settings2 className="w-4 h-4 mr-2" />
            Pricing Profiles
          </TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">
            <Calculator className="w-4 h-4 mr-2" />
            Pricing Rules
          </TabsTrigger>
          <TabsTrigger value="pricing-tool" data-testid="tab-pricing-tool">
            <DollarSign className="w-4 h-4 mr-2" />
            Pricing Tool
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <FieldsSection fields={fields} isLoading={fieldsLoading} />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <ProfilesSection profiles={profiles} isLoading={profilesLoading} />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <RulesSection rules={rules} fields={fields} profiles={profiles} isLoading={rulesLoading} />
        </TabsContent>

        <TabsContent value="pricing-tool" className="space-y-4">
          <PricingToolSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldsSection({ fields, isLoading }: { fields: EstimateField[]; isLoading: boolean }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<EstimateField | null>(null);
  const [formData, setFormData] = useState({
    fieldKey: "",
    label: "",
    fieldType: "text",
    appliesTo: ["internal", "marketing"],
    required: false,
    defaultValue: null as any,
    sortOrder: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/estimate-fields", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-fields"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Field created", description: "The estimate field has been added." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const response = await apiRequest("PATCH", `/api/estimate-fields/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-fields"] });
      setDialogOpen(false);
      setEditingField(null);
      resetForm();
      toast({ title: "Field updated", description: "The estimate field has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/estimate-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimate-fields"] });
      toast({ title: "Field deleted", description: "The estimate field has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      fieldKey: "",
      label: "",
      fieldType: "text",
      appliesTo: ["internal", "marketing"],
      required: false,
      defaultValue: null,
      sortOrder: 0,
    });
  };

  const openEdit = (field: EstimateField) => {
    setEditingField(field);
    setFormData({
      fieldKey: field.fieldKey,
      label: field.label,
      fieldType: field.fieldType,
      appliesTo: field.appliesTo as string[],
      required: field.required,
      defaultValue: field.defaultValue,
      sortOrder: field.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingField) {
      updateMutation.mutate({ id: editingField.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Estimate Fields</CardTitle>
          <CardDescription>
            Define the input fields that appear on estimate forms
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingField(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-field">
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingField ? "Edit Field" : "Add Field"}</DialogTitle>
              <DialogDescription>
                Configure a field for your estimate forms
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Field Key</Label>
                <Input
                  value={formData.fieldKey}
                  onChange={(e) => setFormData({ ...formData, fieldKey: e.target.value })}
                  placeholder="tree_count_small"
                  data-testid="input-field-key"
                />
              </div>
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Number of Small Trees"
                  data-testid="input-field-label"
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={formData.fieldType}
                  onValueChange={(value) => setFormData({ ...formData, fieldType: value })}
                >
                  <SelectTrigger data-testid="select-field-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Required</Label>
                <Switch
                  checked={formData.required}
                  onCheckedChange={(checked) => setFormData({ ...formData, required: checked })}
                  data-testid="switch-required"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Show in Marketing Tool</Label>
                <Switch
                  checked={formData.appliesTo.includes("marketing")}
                  onCheckedChange={(checked) => {
                    const appliesTo = checked 
                      ? [...formData.appliesTo, "marketing"]
                      : formData.appliesTo.filter(t => t !== "marketing");
                    setFormData({ ...formData, appliesTo });
                  }}
                  data-testid="switch-marketing"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-field"
              >
                {editingField ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No fields configured yet. Add your first field to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Field Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Required</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id} data-testid={`row-field-${field.id}`}>
                  <TableCell>
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{field.fieldKey}</TableCell>
                  <TableCell>{field.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{field.fieldType}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(field.appliesTo as string[]).includes("internal") && (
                        <Badge variant="outline">Internal</Badge>
                      )}
                      {(field.appliesTo as string[]).includes("marketing") && (
                        <Badge variant="outline">Marketing</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {field.required && <CheckCircle className="w-4 h-4 text-green-500" />}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(field)}
                        data-testid={`button-edit-field-${field.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(field.id)}
                        data-testid={`button-delete-field-${field.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ProfilesSection({ profiles, isLoading }: { profiles: PricingProfile[]; isLoading: boolean }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<PricingProfile | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    baseRates: { minimumFloorPercentage: 15 },
    taxRules: { defaultRate: 0 },
    depositRules: { defaultPercentage: 0 },
    commissionRules: { defaultPercentage: 0 },
    isDefault: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/pricing-profiles", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-profiles"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Profile created", description: "The pricing profile has been added." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const response = await apiRequest("PATCH", `/api/pricing-profiles/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-profiles"] });
      setDialogOpen(false);
      setEditingProfile(null);
      resetForm();
      toast({ title: "Profile updated", description: "The pricing profile has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pricing-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-profiles"] });
      toast({ title: "Profile deleted", description: "The pricing profile has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      baseRates: { minimumFloorPercentage: 15 },
      taxRules: { defaultRate: 0 },
      depositRules: { defaultPercentage: 0 },
      commissionRules: { defaultPercentage: 0 },
      isDefault: false,
    });
  };

  const openEdit = (profile: PricingProfile) => {
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      description: profile.description || "",
      baseRates: (profile.baseRates as any) || { minimumFloorPercentage: 15 },
      taxRules: (profile.taxRules as any) || { defaultRate: 0 },
      depositRules: (profile.depositRules as any) || { defaultPercentage: 0 },
      commissionRules: (profile.commissionRules as any) || { defaultPercentage: 0 },
      isDefault: profile.isDefault,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingProfile) {
      updateMutation.mutate({ id: editingProfile.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Pricing Profiles</CardTitle>
          <CardDescription>
            Define different pricing configurations for various job types
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingProfile(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-profile">
              <Plus className="w-4 h-4 mr-2" />
              Add Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingProfile ? "Edit Profile" : "Add Profile"}</DialogTitle>
              <DialogDescription>
                Configure a pricing profile for your estimates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Residential Profile"
                  data-testid="input-profile-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Standard pricing for residential jobs"
                  data-testid="input-profile-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input
                    type="number"
                    value={formData.taxRules.defaultRate}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      taxRules: { ...formData.taxRules, defaultRate: Number(e.target.value) }
                    })}
                    data-testid="input-tax-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deposit (%)</Label>
                  <Input
                    type="number"
                    value={formData.depositRules.defaultPercentage}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      depositRules: { ...formData.depositRules, defaultPercentage: Number(e.target.value) }
                    })}
                    data-testid="input-deposit"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Commission (%)</Label>
                  <Input
                    type="number"
                    value={formData.commissionRules.defaultPercentage}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      commissionRules: { ...formData.commissionRules, defaultPercentage: Number(e.target.value) }
                    })}
                    data-testid="input-commission"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Floor (%)</Label>
                  <Input
                    type="number"
                    value={formData.baseRates.minimumFloorPercentage}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      baseRates: { ...formData.baseRates, minimumFloorPercentage: Number(e.target.value) }
                    })}
                    data-testid="input-floor"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Set as Default</Label>
                <Switch
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                  data-testid="switch-default"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-profile"
              >
                {editingProfile ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {profiles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pricing profiles configured yet. Add your first profile to get started.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <Card key={profile.id} data-testid={`card-profile-${profile.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{profile.name}</CardTitle>
                    {profile.isDefault && <Badge>Default</Badge>}
                  </div>
                  {profile.description && (
                    <CardDescription>{profile.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax Rate:</span>
                      <span>{(profile.taxRules as any)?.defaultRate || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deposit:</span>
                      <span>{(profile.depositRules as any)?.defaultPercentage || 0}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission:</span>
                      <span>{(profile.commissionRules as any)?.defaultPercentage || 0}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEdit(profile)}
                      data-testid={`button-edit-profile-${profile.id}`}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteMutation.mutate(profile.id)}
                      data-testid={`button-delete-profile-${profile.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RulesSection({ 
  rules, 
  fields, 
  profiles, 
  isLoading 
}: { 
  rules: PricingRule[]; 
  fields: EstimateField[];
  profiles: PricingProfile[];
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);
  const [formData, setFormData] = useState({
    ruleName: "",
    fieldId: "",
    pricingProfileId: "",
    effectType: "flat",
    effectValue: "0",
    appliesWhen: null as any,
    sortOrder: 0,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/pricing-rules", {
        ...data,
        fieldId: data.fieldId || null,
        pricingProfileId: data.pricingProfileId || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-rules"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Rule created", description: "The pricing rule has been added." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const response = await apiRequest("PATCH", `/api/pricing-rules/${id}`, {
        ...data,
        fieldId: data.fieldId || null,
        pricingProfileId: data.pricingProfileId || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-rules"] });
      setDialogOpen(false);
      setEditingRule(null);
      resetForm();
      toast({ title: "Rule updated", description: "The pricing rule has been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/pricing-rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-rules"] });
      toast({ title: "Rule deleted", description: "The pricing rule has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      ruleName: "",
      fieldId: "",
      pricingProfileId: "",
      effectType: "flat",
      effectValue: "0",
      appliesWhen: null,
      sortOrder: 0,
    });
  };

  const openEdit = (rule: PricingRule) => {
    setEditingRule(rule);
    setFormData({
      ruleName: rule.ruleName,
      fieldId: rule.fieldId || "",
      pricingProfileId: rule.pricingProfileId || "",
      effectType: rule.effectType,
      effectValue: rule.effectValue,
      appliesWhen: rule.appliesWhen,
      sortOrder: rule.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const getFieldName = (fieldId: string | null) => {
    if (!fieldId) return "All Fields";
    const field = fields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const getProfileName = (profileId: string | null) => {
    if (!profileId) return "All Profiles";
    const profile = profiles.find(p => p.id === profileId);
    return profile?.name || profileId;
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Pricing Rules</CardTitle>
          <CardDescription>
            Define how field values affect estimate pricing
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingRule(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-rule">
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRule ? "Edit Rule" : "Add Rule"}</DialogTitle>
              <DialogDescription>
                Configure how a field affects pricing
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rule Name</Label>
                <Input
                  value={formData.ruleName}
                  onChange={(e) => setFormData({ ...formData, ruleName: e.target.value })}
                  placeholder="Over House Premium"
                  data-testid="input-rule-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Linked Field (optional)</Label>
                <Select
                  value={formData.fieldId}
                  onValueChange={(value) => setFormData({ ...formData, fieldId: value })}
                >
                  <SelectTrigger data-testid="select-rule-field">
                    <SelectValue placeholder="Select a field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No Field</SelectItem>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Pricing Profile (optional)</Label>
                <Select
                  value={formData.pricingProfileId}
                  onValueChange={(value) => setFormData({ ...formData, pricingProfileId: value })}
                >
                  <SelectTrigger data-testid="select-rule-profile">
                    <SelectValue placeholder="All profiles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Profiles</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Effect Type</Label>
                  <Select
                    value={formData.effectType}
                    onValueChange={(value) => setFormData({ ...formData, effectType: value })}
                  >
                    <SelectTrigger data-testid="select-effect-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {effectTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Value</Label>
                  <Input
                    type="number"
                    value={formData.effectValue}
                    onChange={(e) => setFormData({ ...formData, effectValue: e.target.value })}
                    data-testid="input-effect-value"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-rule"
              >
                {editingRule ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pricing rules configured yet. Add your first rule to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule Name</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Effect</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                  <TableCell className="font-medium">{rule.ruleName}</TableCell>
                  <TableCell>{getFieldName(rule.fieldId)}</TableCell>
                  <TableCell>{getProfileName(rule.pricingProfileId)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {rule.effectType === "flat" && `$${rule.effectValue}`}
                      {rule.effectType === "percentage" && `${rule.effectValue}%`}
                      {rule.effectType === "multiplier" && `x${rule.effectValue}`}
                      {rule.effectType === "perUnit" && `$${rule.effectValue}/unit`}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(rule)}
                        data-testid={`button-edit-rule-${rule.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
