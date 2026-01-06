import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertCircle,
  ArrowLeft,
  Calculator,
  Send,
  Plus,
  Trash2,
  Lock,
  MessageSquare,
  Mail,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DynamicField, getDefaultFieldValue } from "@/components/DynamicField";
import type { Customer, Property, Estimate, EstimateSnapshot, EstimateField, PricingProfile, PricingSnapshot, EstimatePreviewResult } from "@shared/schema";

type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "expired" | "superseded";

const statusConfig: Record<EstimateStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
  superseded: { label: "Superseded", variant: "outline" },
};

const workItemFormSchema = z.object({
  id: z.string(),
  description: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  unitPrice: z.coerce.number().nonnegative().default(0),
  laborHours: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const estimateFormSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  propertyId: z.string().optional(),
  jobAddress: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  workItems: z.array(workItemFormSchema),
});

type EstimateFormData = z.infer<typeof estimateFormSchema>;

interface EstimateWithSnapshot {
  estimate: Estimate;
  latestSnapshot: EstimateSnapshot | null;
}


function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export default function EstimateBuilder() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isNew = !id || id === "new";

  const [previewResult, setPreviewResult] = useState<EstimatePreviewResult | null>(null);
  const [dynamicInputs, setDynamicInputs] = useState<Record<string, any>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [estimateOptions, setEstimateOptions] = useState<Array<{ id: string; name: string; inputs: Record<string, any> }>>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"email" | "sms" | "both">("email");

  const { data: smsStatus } = useQuery<{ configured: boolean; available: boolean }>({
    queryKey: ['/api/sms/status'],
  });

  const { data: customers, isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: estimateFields = [] } = useQuery<EstimateField[]>({
    queryKey: ['/api/estimate-fields'],
  });

  const { data: pricingProfiles = [] } = useQuery<PricingProfile[]>({
    queryKey: ['/api/pricing-profiles'],
  });

  const internalFields = estimateFields.filter(
    (f) => f.isActive && (f.appliesTo as string[]).includes('internal')
  ).sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: estimateData, isLoading: loadingEstimate, error: estimateError } = useQuery<EstimateWithSnapshot>({
    queryKey: ['/api/estimates', id],
    enabled: !isNew,
  });

  const estimate = estimateData?.estimate;
  const latestSnapshot = estimateData?.latestSnapshot;
  const isDraft = !estimate || estimate.status === "draft";
  const isReadOnly = estimate && estimate.status !== "draft";

  const form = useForm<EstimateFormData>({
    resolver: zodResolver(estimateFormSchema),
    defaultValues: {
      customerId: "",
      propertyId: "",
      jobAddress: "",
      title: "",
      description: "",
      workItems: [{ id: generateId(), description: "", quantity: 1, unit: "each", unitPrice: 0, laborHours: 0, notes: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "workItems",
  });

  const selectedCustomerId = form.watch("customerId");
  const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId);
  const hasValidPhone = selectedCustomer?.phone && selectedCustomer.phone.replace(/\D/g, '').length >= 10;

  const { data: properties } = useQuery<Property[]>({
    queryKey: ['/api/customers', selectedCustomerId, 'properties'],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${selectedCustomerId}/properties`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch properties');
      }
      return response.json();
    },
    enabled: !!selectedCustomerId,
  });

  useEffect(() => {
    if (estimate) {
      const workItems = (estimate.workItems as any[]) || [];
      form.reset({
        customerId: estimate.customerId,
        propertyId: estimate.propertyId || "",
        jobAddress: (estimate as any).jobAddress || "",
        title: estimate.title || "",
        description: estimate.description || "",
        workItems: workItems.length > 0 
          ? workItems.map((item) => ({
              id: item.id || generateId(),
              description: item.description || "",
              quantity: item.quantity || 1,
              unit: item.unit || "each",
              unitPrice: item.unitPrice || 0,
              laborHours: item.laborHours || 0,
              notes: item.notes || "",
            }))
          : [{ id: generateId(), description: "", quantity: 1, unit: "each", unitPrice: 0, laborHours: 0, notes: "" }],
      });

      if ((estimate as any).pricingProfileId) {
        setSelectedProfileId((estimate as any).pricingProfileId);
      }

      if ((estimate as any).inputSnapshot && typeof (estimate as any).inputSnapshot === 'object') {
        setDynamicInputs((estimate as any).inputSnapshot);
      }

      if ((estimate as any).pricingSnapshot && typeof (estimate as any).pricingSnapshot === 'object') {
        setPreviewResult({
          inputSnapshot: (estimate as any).inputSnapshot || {},
          fieldsUsed: [],
          pricingProfile: null,
          pricingSnapshot: (estimate as any).pricingSnapshot,
          workItemsSnapshot: workItems,
        });
      }
    }
  }, [estimate, form]);

  useEffect(() => {
    if (internalFields.length > 0 && Object.keys(dynamicInputs).length === 0 && !estimate) {
      const defaults: Record<string, any> = {};
      internalFields.forEach((field) => {
        defaults[field.fieldKey] = getDefaultFieldValue(field);
      });
      setDynamicInputs(defaults);
    }
  }, [internalFields, dynamicInputs, estimate]);

  const createMutation = useMutation({
    mutationFn: async (data: EstimateFormData) => {
      const response = await apiRequest("POST", "/api/estimates", {
        customerId: data.customerId,
        propertyId: data.propertyId || null,
        jobAddress: data.jobAddress || null,
        title: data.title || null,
        description: data.description || null,
        workItems: data.workItems.map((item) => ({
          ...item,
          unitPrice: item.unitPrice || 0,
        })),
        pricingProfileId: selectedProfileId || null,
        inputs: dynamicInputs,
      });
      return response.json();
    },
    onSuccess: (newEstimate) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      toast({ title: "Estimate created successfully" });
      setLocation(`/estimates/${newEstimate.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create estimate", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EstimateFormData) => {
      const response = await apiRequest("PATCH", `/api/estimates/${id}`, {
        jobAddress: data.jobAddress || null,
        title: data.title || null,
        description: data.description || null,
        workItems: data.workItems.map((item) => ({
          ...item,
          unitPrice: item.unitPrice || 0,
        })),
        pricingProfileId: selectedProfileId || null,
        inputs: dynamicInputs,
      });
      if (response.status === 409) {
        throw new Error("Locked - create change order");
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update estimate");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      toast({ title: "Estimate saved" });
    },
    onError: (error: Error) => {
      if (error.message === "Locked - create change order") {
        toast({ 
          title: "Estimate is locked", 
          description: "This estimate has been sent. Create a change order to modify.", 
          variant: "destructive" 
        });
      } else {
        toast({ title: "Failed to save estimate", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/estimates/${id}`);
      if (response.status === 409) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Cannot delete this estimate");
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete estimate");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      toast({ title: "Draft estimate deleted" });
      setLocation("/estimates");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete estimate", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteMutation.mutate();
  };

  const handleCalculate = async () => {
    if (!id || isNew) {
      toast({ title: "Save the estimate first", description: "Please save the estimate before calculating pricing.", variant: "destructive" });
      return;
    }

    setIsCalculating(true);
    try {
      const formData = form.getValues();
      await updateMutation.mutateAsync(formData);
      
      const workItems = formData.workItems.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice || 0,
        laborHours: item.laborHours || 0,
        notes: item.notes || '',
      }));

      const options = estimateOptions.length > 0 
        ? estimateOptions.map(opt => ({
            name: opt.name,
            inputs: opt.inputs,
          }))
        : undefined;

      const response = await apiRequest("POST", "/api/estimates/preview", {
        mode: 'internal',
        pricingProfileId: selectedProfileId || undefined,
        inputs: dynamicInputs,
        workItems,
        options,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to calculate pricing");
      }
      const result = await response.json();
      setPreviewResult(result);
      toast({ title: "Pricing calculated" });
    } catch (error: any) {
      toast({ title: "Calculation failed", description: error.message, variant: "destructive" });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSendClick = () => {
    if (!id || isNew) {
      toast({ title: "Save the estimate first", variant: "destructive" });
      return;
    }
    // Reset to email if customer doesn't have a valid phone
    if (!hasValidPhone && (deliveryMethod === 'sms' || deliveryMethod === 'both')) {
      setDeliveryMethod('email');
    }
    setShowSendDialog(true);
  };

  const handleSend = async () => {
    if (!id || isNew) {
      toast({ title: "Save the estimate first", variant: "destructive" });
      return;
    }

    setShowSendDialog(false);
    setIsSending(true);
    try {
      const formData = form.getValues();
      await updateMutation.mutateAsync(formData);
      
      const response = await apiRequest("POST", `/api/estimates/${id}/send`, {
        deliveryMethod,
      });
      if (response.status === 409) {
        toast({ 
          title: "Estimate is locked", 
          description: "This estimate has already been sent. Create a change order to modify.", 
          variant: "destructive" 
        });
        return;
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to send estimate");
      }

      const result = await response.json();
      
      let successMessage = "Estimate sent to customer";
      if (result.smsDelivery) {
        if (result.smsDelivery.success) {
          successMessage = deliveryMethod === "both" 
            ? "Estimate sent via email and SMS" 
            : "Estimate sent via SMS";
        } else {
          toast({ 
            title: "SMS delivery failed", 
            description: result.smsDelivery.error || "Could not send SMS", 
            variant: "destructive" 
          });
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', id] });
      toast({ title: successMessage });
      setLocation("/estimates");
    } catch (error: any) {
      toast({ title: "Failed to send estimate", description: error.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const onSubmit = (data: EstimateFormData) => {
    if (isNew) {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  const addWorkItem = () => {
    append({ id: generateId(), description: "", quantity: 1, unit: "each", unitPrice: 0, laborHours: 0, notes: "" });
  };

  if (!isNew && loadingEstimate) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isNew && estimateError) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Failed to load estimate</h2>
          <p className="text-muted-foreground mt-2">{(estimateError as Error).message}</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/estimates")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Estimates
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/estimates")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              {isNew ? "New Estimate" : estimate?.estimateNumber || "Estimate"}
            </h1>
            {!isNew && estimate && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={statusConfig[estimate.status as EstimateStatus]?.variant || "secondary"}>
                  {statusConfig[estimate.status as EstimateStatus]?.label || estimate.status}
                </Badge>
                {!(estimate as any).pricingProfileId && (
                  <Badge variant="outline" data-testid="badge-legacy-estimate">
                    Legacy
                  </Badge>
                )}
                {isReadOnly && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Read-only
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {isDraft && (
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(true)}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-draft"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? "Deleting..." : "Delete Draft"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleCalculate}
              disabled={isCalculating || isNew}
              data-testid="button-calculate"
            >
              <Calculator className="h-4 w-4 mr-2" />
              {isCalculating ? "Calculating..." : "Calculate"}
            </Button>
            <Button
              onClick={handleSendClick}
              disabled={isSending || isNew}
              data-testid="button-send"
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? "Sending..." : "Send to Customer"}
            </Button>
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer & Property</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!isNew || loadingCustomers || isReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-customer">
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(customers || []).map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.firstName} {customer.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property (optional)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "_none" ? "" : value)}
                        value={field.value || "_none"}
                        disabled={!selectedCustomerId || isReadOnly}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-property">
                            <SelectValue placeholder="Select a property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">No property</SelectItem>
                          {(properties || []).map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.address}{property.city ? `, ${property.city}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="jobAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Address</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter the job site address" 
                        {...field} 
                        disabled={isReadOnly}
                        data-testid="input-job-address"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title (optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Tree Removal - Oak in backyard" 
                        {...field} 
                        disabled={isReadOnly}
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional details about the work..." 
                        {...field} 
                        disabled={isReadOnly}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {(internalFields.length > 0 || pricingProfiles.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Estimate Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pricingProfiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Pricing Profile</Label>
                    <Select
                      value={selectedProfileId || "_default"}
                      onValueChange={(val) => setSelectedProfileId(val === "_default" ? null : val)}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger data-testid="select-pricing-profile">
                        <SelectValue placeholder="Select pricing profile" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_default">Default Profile</SelectItem>
                        {pricingProfiles.map((profile) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name} {profile.isDefault && "(Default)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {internalFields.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {internalFields.map((field) => (
                      <DynamicField
                        key={field.id}
                        field={field}
                        value={dynamicInputs[field.fieldKey]}
                        onChange={(val) => setDynamicInputs((prev) => ({ ...prev, [field.fieldKey]: val }))}
                        disabled={isReadOnly}
                      />
                    ))}
                  </div>
                )}

                {isDraft && internalFields.length > 0 && (
                  <div className="pt-4 border-t space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <Label className="font-medium">Comparison Options</Label>
                        <p className="text-sm text-muted-foreground">Create alternative pricing options for the customer</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const optionDefaults: Record<string, any> = {};
                          internalFields.forEach((field) => {
                            optionDefaults[field.fieldKey] = getDefaultFieldValue(field);
                          });
                          setEstimateOptions([...estimateOptions, { id: generateId(), name: `Option ${estimateOptions.length + 1}`, inputs: optionDefaults }]);
                        }}
                        data-testid="button-add-option"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Option
                      </Button>
                    </div>

                    {estimateOptions.map((option, optIdx) => (
                      <div key={option.id} className="p-4 border rounded-md space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            value={option.name}
                            onChange={(e) => {
                              const updated = [...estimateOptions];
                              updated[optIdx].name = e.target.value;
                              setEstimateOptions(updated);
                            }}
                            placeholder="Option name"
                            className="max-w-xs"
                            data-testid={`input-option-name-${optIdx}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEstimateOptions(estimateOptions.filter((_, i) => i !== optIdx))}
                            data-testid={`button-remove-option-${optIdx}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {internalFields.map((field) => (
                            <DynamicField
                              key={field.id}
                              field={field}
                              value={option.inputs[field.fieldKey]}
                              onChange={(val) => {
                                const updated = [...estimateOptions];
                                updated[optIdx].inputs[field.fieldKey] = val;
                                setEstimateOptions(updated);
                              }}
                              disabled={isReadOnly}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Work Items</CardTitle>
              {isDraft && (
                <Button type="button" variant="outline" size="sm" onClick={addWorkItem} data-testid="button-add-item">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-md space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                    {isDraft && fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name={`workItems.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Remove 30ft oak tree" 
                            {...field} 
                            disabled={isReadOnly}
                            data-testid={`input-item-description-${index}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name={`workItems.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0.01" 
                              step="0.01"
                              {...field} 
                              disabled={isReadOnly}
                              data-testid={`input-item-quantity-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`workItems.${index}.unitPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Price ($)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              step="0.01"
                              {...field} 
                              disabled={isReadOnly}
                              data-testid={`input-item-unit-price-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`workItems.${index}.unit`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={isReadOnly}
                          >
                            <FormControl>
                              <SelectTrigger data-testid={`select-item-unit-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="each">Each</SelectItem>
                              <SelectItem value="hour">Hour</SelectItem>
                              <SelectItem value="day">Day</SelectItem>
                              <SelectItem value="tree">Tree</SelectItem>
                              <SelectItem value="stump">Stump</SelectItem>
                              <SelectItem value="linear_ft">Linear Ft</SelectItem>
                              <SelectItem value="cubic_yd">Cubic Yd</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`workItems.${index}.laborHours`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Labor Hours</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              step="0.5"
                              {...field} 
                              disabled={isReadOnly}
                              data-testid={`input-item-hours-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name={`workItems.${index}.notes`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Additional notes for this item..." 
                            {...field} 
                            disabled={isReadOnly}
                            data-testid={`input-item-notes-${index}`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {isDraft && (
            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Estimate"}
              </Button>
            </div>
          )}
        </form>
      </Form>

      {(previewResult || latestSnapshot) && (
        <Card>
          <CardHeader>
            <CardTitle>Pricing Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {previewResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Base Subtotal</Label>
                    <p className="font-medium" data-testid="text-base-subtotal">
                      {formatCurrency(previewResult.pricingSnapshot.baseSubtotal)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Adjustments</Label>
                    <p className="font-medium" data-testid="text-adjustments">
                      {formatCurrency(previewResult.pricingSnapshot.adjustmentsTotal)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Discounts</Label>
                    <p className="font-medium" data-testid="text-discounts">
                      {formatCurrency(previewResult.pricingSnapshot.discountsTotal)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Margin</Label>
                    <p className="font-medium" data-testid="text-margin">
                      {previewResult.pricingSnapshot.marginPercentage.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Subtotal</Label>
                    <p className="text-lg font-semibold" data-testid="text-subtotal">
                      {formatCurrency(previewResult.pricingSnapshot.subtotalAfterAdjustments)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Tax ({(previewResult.pricingSnapshot.taxRate * 100).toFixed(2)}%)</Label>
                    <p className="text-lg font-semibold" data-testid="text-tax">
                      {formatCurrency(previewResult.pricingSnapshot.taxAmount)}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <Label className="text-muted-foreground">Total</Label>
                  <p className="text-2xl font-bold" data-testid="text-total">
                    {formatCurrency(previewResult.pricingSnapshot.total)}
                  </p>
                </div>
                {previewResult.pricingSnapshot.depositAmount > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Deposit required: {formatCurrency(previewResult.pricingSnapshot.depositAmount)} ({previewResult.pricingSnapshot.depositPercentage}%)
                  </div>
                )}
                {previewResult.pricingSnapshot.floorViolation && (
                  <div className="p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Warning: Price is below minimum floor
                    </p>
                  </div>
                )}
                {previewResult.pricingSnapshot.warnings.length > 0 && (
                  <div className="space-y-1">
                    {previewResult.pricingSnapshot.warnings.map((warning, i) => (
                      <div key={i} className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {warning}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {previewResult.options && previewResult.options.length > 0 && (
                  <div className="pt-4 border-t space-y-4">
                    <Label className="font-medium">Comparison Options</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {previewResult.options.map((opt, idx) => (
                        <div key={idx} className="p-4 border rounded-md space-y-2">
                          <h4 className="font-medium" data-testid={`text-option-name-${idx}`}>{opt.name}</h4>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Subtotal:</span>
                              <span>{formatCurrency(opt.pricingSnapshot.subtotalAfterAdjustments)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tax:</span>
                              <span>{formatCurrency(opt.pricingSnapshot.taxAmount)}</span>
                            </div>
                            <div className="flex justify-between font-semibold pt-1 border-t">
                              <span>Total:</span>
                              <span data-testid={`text-option-total-${idx}`}>{formatCurrency(opt.pricingSnapshot.total)}</span>
                            </div>
                          </div>
                          {opt.pricingSnapshot.floorViolation && (
                            <div className="text-xs text-destructive flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Below floor
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : latestSnapshot ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Subtotal</Label>
                    <p className="text-lg font-semibold" data-testid="text-snapshot-subtotal">
                      {formatCurrency(latestSnapshot.subtotal)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Tax</Label>
                    <p className="text-lg font-semibold" data-testid="text-snapshot-tax">
                      {formatCurrency(latestSnapshot.taxAmount)}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <Label className="text-muted-foreground">Total</Label>
                  <p className="text-2xl font-bold" data-testid="text-snapshot-total">
                    {formatCurrency(latestSnapshot.total)}
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Draft Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this draft estimate? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Estimate to Customer</DialogTitle>
            <DialogDescription>
              Choose how you'd like to deliver this estimate to your customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-sm font-medium mb-3 block">Delivery Method</Label>
            <RadioGroup 
              value={deliveryMethod} 
              onValueChange={(value) => setDeliveryMethod(value as "email" | "sms" | "both")}
              className="space-y-3"
            >
              <div className="flex items-center space-x-3 p-3 rounded-md border hover-elevate">
                <RadioGroupItem value="email" id="delivery-email" data-testid="radio-delivery-email" />
                <Label htmlFor="delivery-email" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">Email Only</div>
                    <div className="text-sm text-muted-foreground">Send a link via email</div>
                  </div>
                </Label>
              </div>
              
              {smsStatus?.available && (
                <>
                  <div className={`flex items-center space-x-3 p-3 rounded-md border ${hasValidPhone ? 'hover-elevate' : 'opacity-50'}`}>
                    <RadioGroupItem 
                      value="sms" 
                      id="delivery-sms" 
                      data-testid="radio-delivery-sms" 
                      disabled={!hasValidPhone}
                    />
                    <Label htmlFor="delivery-sms" className={`flex items-center gap-2 flex-1 ${hasValidPhone ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">Text Message (SMS)</div>
                        <div className="text-sm text-muted-foreground">Send a magic link via SMS</div>
                      </div>
                    </Label>
                  </div>
                  
                  <div className={`flex items-center space-x-3 p-3 rounded-md border ${hasValidPhone ? 'hover-elevate' : 'opacity-50'}`}>
                    <RadioGroupItem 
                      value="both" 
                      id="delivery-both" 
                      data-testid="radio-delivery-both"
                      disabled={!hasValidPhone}
                    />
                    <Label htmlFor="delivery-both" className={`flex items-center gap-2 flex-1 ${hasValidPhone ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                      <div className="flex items-center gap-1">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium">Email and SMS</div>
                        <div className="text-sm text-muted-foreground">Send via both channels</div>
                      </div>
                    </Label>
                  </div>
                  
                  {!hasValidPhone && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                      <AlertCircle className="h-4 w-4" />
                      <span>This customer doesn't have a valid phone number. Update their contact info to enable SMS.</span>
                    </div>
                  )}
                </>
              )}
            </RadioGroup>
            
            {!smsStatus?.available && (
              <p className="text-sm text-muted-foreground mt-3">
                SMS delivery is not configured. Contact your administrator to enable text message delivery.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)} data-testid="button-cancel-send">
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending} data-testid="button-confirm-send">
              <Send className="h-4 w-4 mr-2" />
              {isSending ? "Sending..." : "Send Estimate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
