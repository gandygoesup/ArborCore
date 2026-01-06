import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TreeDeciduous,
  Minus,
  Plus,
  Zap,
  Home,
  Skull,
  Mountain,
  Calculator,
  RefreshCw,
  ArrowLeft,
  Send,
  AlertTriangle,
  ChevronDown,
  User,
  MapPin,
  Phone,
  Mail,
  Camera,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Customer, User as UserType } from "@shared/schema";

const TREE_SIZES = [
  { key: 'small' as const, label: 'Small Trees', hint: '0-30ft', icon: TreeDeciduous },
  { key: 'medium' as const, label: 'Medium Trees', hint: '30-50ft', icon: TreeDeciduous },
  { key: 'large' as const, label: 'Large Trees', hint: '50-75ft', icon: TreeDeciduous },
  { key: 'xl' as const, label: 'XL Trees', hint: '75ft+', icon: TreeDeciduous },
] as const;

const RISK_MODIFIERS = [
  { key: 'powerLines', label: 'Power lines', percentage: 13 },
  { key: 'unmovableStructures', label: 'Unmovable structures', percentage: 16 },
  { key: 'backyardTree', label: 'Backyard tree', percentage: 6 },
  { key: 'deadTree', label: 'Dead tree', percentage: 14 },
  { key: 'highPriority', label: 'High priority', percentage: 5 },
  { key: 'difficultAccess', label: 'Difficult access', percentage: 10 },
  { key: 'steepSlope', label: 'Steep slope', percentage: 12 },
  { key: 'overHouse', label: 'Tree over house/structure', percentage: 15 },
  { key: 'multipleBuildings', label: 'Multiple buildings', percentage: 8 },
  { key: 'wetGround', label: 'Wet/soft ground', percentage: 7 },
  { key: 'limitedWorkspace', label: 'Limited workspace', percentage: 9 },
] as const;

const CLIENT_TYPES = [
  { value: 'residential', label: 'Residential Homeowner' },
  { value: 'solar', label: 'Solar Company/Advisor' },
  { value: 'referral', label: 'Referral (non-team)' },
] as const;

const PRICING_MODES = [
  { value: 'trees', label: 'Tree Count (per tree)' },
  { value: 'day', label: 'Day Rate' },
] as const;

type TreeSize = typeof TREE_SIZES[number]['key'];
type RiskModifierKey = typeof RISK_MODIFIERS[number]['key'];

const formSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  projectAddress: z.string().min(1, "Project address is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  customerId: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PricingResult {
  subtotal: number;
  discounts: number;
  discountLabels: string[];
  subtotalAfterDiscounts: number;
  tax: number;
  taxRate: number;
  total: number;
  treeCount: number;
  commission: number;
}

function TreeCounter({ 
  label, 
  hint, 
  value, 
  onChange,
  testIdPrefix,
}: { 
  label: string; 
  hint: string; 
  value: number; 
  onChange: (value: number) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label} ({hint})</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          data-testid={`button-decrease-${testIdPrefix}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          min="0"
          value={value || ""}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-20 text-center"
          data-testid={`input-${testIdPrefix}`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(value + 1)}
          data-testid={`button-increase-${testIdPrefix}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function NewEstimate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [clientType, setClientType] = useState('residential');
  const [pricingMode, setPricingMode] = useState('trees');
  const [hideDeposit, setHideDeposit] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState<string>('none');

  const [treeCounts, setTreeCounts] = useState<Record<TreeSize, number>>({
    small: 0,
    medium: 0,
    large: 0,
    xl: 0,
  });

  const [dayCount, setDayCount] = useState(1);
  const [modifiers, setModifiers] = useState<Partial<Record<RiskModifierKey, boolean>>>({});
  const [stumpSize, setStumpSize] = useState<'none' | 'sm' | 'lx'>('none');
  const [showSpecialConditions, setShowSpecialConditions] = useState(false);
  const [priceOverride, setPriceOverride] = useState('');
  const [useOverride, setUseOverride] = useState(false);

  const [isCalculating, setIsCalculating] = useState(false);
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: "",
      projectAddress: "",
      phone: "",
      email: "",
      customerId: "",
      notes: "",
    },
  });

  const { data: customers, isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: users } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
  });

  const totalTreeCount = useMemo(() => 
    Object.values(treeCounts).reduce((sum, count) => sum + count, 0),
    [treeCounts]
  );

  const calculatePricing = useCallback((): PricingResult => {
    const TAX_RATE = 0.06625;
    const COMMISSION_RATE = 0.15;
    const MULTI_TREE_DISCOUNT = 0.10;

    const isSolar = clientType === 'solar';
    const basePricing = isSolar 
      ? { small: 1035, medium: 1898, large: 2530, xl: 3105 }
      : { small: 900, medium: 1650, large: 2200, xl: 2700 };

    let subtotal = 0;

    if (pricingMode === 'trees') {
      subtotal = 
        treeCounts.small * basePricing.small +
        treeCounts.medium * basePricing.medium +
        treeCounts.large * basePricing.large +
        treeCounts.xl * basePricing.xl;

      let totalModifierPercent = 0;
      RISK_MODIFIERS.forEach(({ key, percentage }) => {
        if (modifiers[key]) {
          totalModifierPercent += percentage;
        }
      });
      subtotal += subtotal * (totalModifierPercent / 100);

      if (stumpSize === 'sm') subtotal += 300;
      if (stumpSize === 'lx') subtotal += 500;
    } else {
      const dayRate = isSolar ? 2800 : 2600;
      subtotal = dayRate * dayCount;
    }

    const discountLabels: string[] = [];
    let discounts = 0;

    if (pricingMode === 'trees' && totalTreeCount >= 3) {
      const discount = subtotal * MULTI_TREE_DISCOUNT;
      discounts += discount;
      discountLabels.push(`Multi-tree (10%)`);
    }

    const subtotalAfterDiscounts = subtotal - discounts;
    const tax = subtotalAfterDiscounts * TAX_RATE;
    
    let total = subtotalAfterDiscounts + tax;
    
    if (useOverride && parseFloat(priceOverride) > 0) {
      total = parseFloat(priceOverride);
    }

    const commission = subtotalAfterDiscounts * COMMISSION_RATE;

    return {
      subtotal,
      discounts,
      discountLabels,
      subtotalAfterDiscounts,
      tax,
      taxRate: TAX_RATE,
      total,
      treeCount: totalTreeCount,
      commission,
    };
  }, [treeCounts, modifiers, stumpSize, pricingMode, dayCount, clientType, totalTreeCount, useOverride, priceOverride]);

  useEffect(() => {
    const result = calculatePricing();
    setPricingResult(result);
  }, [calculatePricing]);

  const createEstimateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const inputs = {
        clientType,
        pricingMode,
        treeCounts,
        dayCount: pricingMode === 'day' ? dayCount : undefined,
        modifiers,
        stumpSize,
        hideDeposit,
        useOverride,
        priceOverride: useOverride ? parseFloat(priceOverride) : undefined,
        repId: selectedRepId !== 'none' ? selectedRepId : undefined,
      };

      const workItems = [];
      
      if (pricingMode === 'trees') {
        if (treeCounts.small > 0) {
          workItems.push({
            id: `small-${Date.now()}`,
            description: `Small tree removal (0-30ft)`,
            quantity: treeCounts.small,
            unit: 'each',
            unitPrice: clientType === 'solar' ? 1035 : 900,
            laborHours: treeCounts.small * 2,
            notes: '',
          });
        }
        if (treeCounts.medium > 0) {
          workItems.push({
            id: `medium-${Date.now()}`,
            description: `Medium tree removal (30-50ft)`,
            quantity: treeCounts.medium,
            unit: 'each',
            unitPrice: clientType === 'solar' ? 1898 : 1650,
            laborHours: treeCounts.medium * 3,
            notes: '',
          });
        }
        if (treeCounts.large > 0) {
          workItems.push({
            id: `large-${Date.now()}`,
            description: `Large tree removal (50-75ft)`,
            quantity: treeCounts.large,
            unit: 'each',
            unitPrice: clientType === 'solar' ? 2530 : 2200,
            laborHours: treeCounts.large * 4,
            notes: '',
          });
        }
        if (treeCounts.xl > 0) {
          workItems.push({
            id: `xl-${Date.now()}`,
            description: `XL tree removal (75ft+)`,
            quantity: treeCounts.xl,
            unit: 'each',
            unitPrice: clientType === 'solar' ? 3105 : 2700,
            laborHours: treeCounts.xl * 6,
            notes: '',
          });
        }
        if (stumpSize !== 'none') {
          workItems.push({
            id: `stump-${Date.now()}`,
            description: stumpSize === 'sm' ? 'Stump grinding (small)' : 'Stump grinding (large)',
            quantity: 1,
            unit: 'job',
            unitPrice: stumpSize === 'sm' ? 300 : 500,
            laborHours: stumpSize === 'sm' ? 1 : 2,
            notes: '',
          });
        }
      } else {
        workItems.push({
          id: `day-rate-${Date.now()}`,
          description: `Day rate service (${dayCount} day${dayCount > 1 ? 's' : ''})`,
          quantity: dayCount,
          unit: 'day',
          unitPrice: clientType === 'solar' ? 2800 : 2600,
          laborHours: dayCount * 8,
          notes: '',
        });
      }

      let customerId = data.customerId;

      if (!customerId && data.customerName) {
        const customerResponse = await apiRequest("POST", "/api/customers", {
          firstName: data.customerName.split(' ')[0] || data.customerName,
          lastName: data.customerName.split(' ').slice(1).join(' ') || '',
          email: data.email || null,
          phone: data.phone || null,
          address: data.projectAddress,
          status: 'active',
        });
        const newCustomer = await customerResponse.json();
        customerId = newCustomer.id;
      }

      const response = await apiRequest("POST", "/api/estimates", {
        customerId,
        jobAddress: data.projectAddress,
        title: `Estimate for ${data.customerName}`,
        description: data.notes || null,
        workItems,
        inputs,
        pricingProfileId: null,
      });
      return response.json();
    },
    onSuccess: (newEstimate) => {
      queryClient.invalidateQueries({ queryKey: ['/api/estimates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Estimate created successfully" });
      setLocation(`/estimates/${newEstimate.id}`);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create estimate", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: FormData) => {
    if (pricingMode === 'trees' && totalTreeCount === 0) {
      toast({ title: "Add at least one tree", variant: "destructive" });
      return;
    }
    createEstimateMutation.mutate(data);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/estimates")} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">
            New Estimate
          </h1>
          <p className="text-muted-foreground text-sm">
            Create a new estimate using the pricing calculator
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John Smith" data-testid="input-customer-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="projectAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Address</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="123 Main St, City, State" data-testid="input-project-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Phone</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="(555) 123-4567" data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Email</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" placeholder="john@example.com" data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Rep</Label>
                    <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                      <SelectTrigger data-testid="select-rep">
                        <SelectValue placeholder="Select Rep" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No rep assigned</SelectItem>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.firstName} {user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Client Type</Label>
                    <Select value={clientType} onValueChange={setClientType}>
                      <SelectTrigger data-testid="select-client-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label htmlFor="hideDeposit" className="text-sm cursor-pointer">
                      Hide deposit from customer estimate (show only total)
                    </Label>
                    <Switch
                      id="hideDeposit"
                      checked={hideDeposit}
                      onCheckedChange={setHideDeposit}
                      data-testid="switch-hide-deposit"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Pricing Mode</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select value={pricingMode} onValueChange={setPricingMode}>
                    <SelectTrigger data-testid="select-pricing-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {pricingMode === 'trees' ? (
                    <div className="grid grid-cols-2 gap-4">
                      {TREE_SIZES.map((size) => (
                        <TreeCounter
                          key={size.key}
                          label={size.label}
                          hint={size.hint}
                          value={treeCounts[size.key]}
                          onChange={(value) => setTreeCounts(prev => ({ ...prev, [size.key]: value }))}
                          testIdPrefix={`tree-${size.key}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Number of Days</Label>
                      <Input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={dayCount}
                        onChange={(e) => setDayCount(parseFloat(e.target.value) || 1)}
                        data-testid="input-day-count"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Stump Grinding</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={stumpSize} onValueChange={(v: 'none' | 'sm' | 'lx') => setStumpSize(v)}>
                    <SelectTrigger data-testid="select-stump-grinding">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No stumps</SelectItem>
                      <SelectItem value="sm">Small stumps (+$300)</SelectItem>
                      <SelectItem value="lx">Large stumps (+$500)</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {pricingMode === 'trees' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Site Conditions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {RISK_MODIFIERS.map((modifier) => (
                        <div key={modifier.key} className="flex items-center gap-2">
                          <Switch
                            id={modifier.key}
                            checked={modifiers[modifier.key] || false}
                            onCheckedChange={(checked) => 
                              setModifiers(prev => ({ ...prev, [modifier.key]: checked }))
                            }
                            data-testid={`switch-${modifier.key}`}
                          />
                          <Label htmlFor={modifier.key} className="text-sm cursor-pointer">
                            {modifier.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground text-sm">
                          Notes will appear on the estimate PDF
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Site details, access constraints, schedule, special requests, etc."
                            rows={4}
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Project Photos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-md p-6 text-center">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground mb-1">
                      Click or drag photos here
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You can add up to 10 more photos. Images will be compressed automatically
                    </p>
                    <Button type="button" variant="outline" className="mt-4" data-testid="button-upload-photos">
                      Select Photos
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Collapsible open={showSpecialConditions} onOpenChange={setShowSpecialConditions}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    data-testid="button-special-conditions"
                  >
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Special Conditions & Price Override (Edge Cases Only)
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showSpecialConditions ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="useOverride" className="text-sm cursor-pointer">
                          Use price override
                        </Label>
                        <Switch
                          id="useOverride"
                          checked={useOverride}
                          onCheckedChange={setUseOverride}
                          data-testid="switch-use-override"
                        />
                      </div>
                      {useOverride && (
                        <div className="space-y-2">
                          <Label>Override Amount</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={priceOverride}
                            onChange={(e) => setPriceOverride(e.target.value)}
                            placeholder="Enter override price"
                            data-testid="input-price-override"
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div className="lg:col-span-1">
              <Card className="sticky top-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Pricing Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pricingResult && (
                    <>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal (before discounts)</span>
                          <span data-testid="text-subtotal">{formatCurrency(pricingResult.subtotal)}</span>
                        </div>
                        
                        {pricingResult.discounts > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Total Savings</span>
                            <span>-{formatCurrency(pricingResult.discounts)}</span>
                          </div>
                        )}

                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal (after discounts)</span>
                          <span>{formatCurrency(pricingResult.subtotalAfterDiscounts)}</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sales Tax ({(pricingResult.taxRate * 100).toFixed(3)}%)</span>
                          <span>{formatCurrency(pricingResult.tax)}</span>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex justify-between text-lg font-bold">
                        <span>Total Amount</span>
                        <span data-testid="text-total">{formatCurrency(pricingResult.total)}</span>
                      </div>

                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Commission (15% of pre-tax)</span>
                        <span>{formatCurrency(pricingResult.commission)}</span>
                      </div>

                      {pricingResult.discountLabels.length > 0 && (
                        <>
                          <Separator />
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                              Discounts Applied
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {pricingResult.discountLabels.map((label, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      <Button 
                        type="submit"
                        className="w-full" 
                        size="lg"
                        disabled={createEstimateMutation.isPending}
                        data-testid="button-create-estimate"
                      >
                        {createEstimateMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Create Estimate
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
