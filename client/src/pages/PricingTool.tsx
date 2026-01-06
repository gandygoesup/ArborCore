import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TreeDeciduous,
  Minus,
  Plus,
  Zap,
  Home,
  Skull,
  Mountain,
  ArrowRight,
  Calculator,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Tree size configuration
const TREE_SIZES = [
  { key: 'small' as const, label: 'Small', hint: 'Under 30ft', icon: TreeDeciduous },
  { key: 'medium' as const, label: 'Medium', hint: '30-50ft', icon: TreeDeciduous },
  { key: 'large' as const, label: 'Large', hint: '50-70ft', icon: TreeDeciduous },
  { key: 'xl' as const, label: 'XL', hint: '70ft+', icon: TreeDeciduous },
] as const;

// Risk modifier configuration
const RISK_MODIFIERS = [
  { key: 'powerLines', label: 'Power lines nearby', icon: Zap, percentage: 15 },
  { key: 'overHouse', label: 'Over house/structure', icon: Home, percentage: 12 },
  { key: 'deadTree', label: 'Dead/hazard tree', icon: Skull, percentage: 12 },
  { key: 'difficultAccess', label: 'Difficult access/limited workspace', icon: Mountain, percentage: 8 },
] as const;

type TreeSize = typeof TREE_SIZES[number]['key'];
type RiskModifierKey = typeof RISK_MODIFIERS[number]['key'];

interface PricingInput {
  treeCounts: Record<TreeSize, number>;
  modifiers: Partial<Record<RiskModifierKey, boolean>>;
  cleanup: {
    stumpGrinding: 'none' | 'small' | 'large';
    keepFirewood: boolean;
    keepBrush: boolean;
  };
  timeEstimate: 'half' | 'full' | 'multi';
}

interface PricingPreviewResult {
  workItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unit: string;
    laborHours: number;
    unitPrice: number;
  }>;
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  modifiers: {
    applied: string[];
    totalPercentageAdjustment: number;
  };
  meta: {
    crewDays: number;
    costProfileVersionId: string;
    timestamp: string;
    totalLaborHours: number;
    totalTreeCount: number;
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Counter component for tree sizes
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
    <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
      <div className="flex flex-col">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value === 0}
          data-testid={`button-decrease-${testIdPrefix}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center font-semibold" data-testid={`text-count-${testIdPrefix}`}>
          {value}
        </span>
        <Button
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

export default function PricingTool() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Form state
  const [treeCounts, setTreeCounts] = useState<Record<TreeSize, number>>({
    small: 0,
    medium: 0,
    large: 0,
    xl: 0,
  });

  const [modifiers, setModifiers] = useState<Partial<Record<RiskModifierKey, boolean>>>({});

  const [cleanup, setCleanup] = useState({
    stumpGrinding: 'none' as 'none' | 'small' | 'large',
    keepFirewood: false,
    keepBrush: false,
  });

  const [timeEstimate, setTimeEstimate] = useState<'half' | 'full' | 'multi'>('full');

  // Preview state
  const [previewResult, setPreviewResult] = useState<PricingPreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastInputHash, setLastInputHash] = useState<string>('');

  // Calculate total tree count
  const totalTreeCount = useMemo(() => 
    Object.values(treeCounts).reduce((sum, count) => sum + count, 0),
    [treeCounts]
  );

  // Create input hash for caching
  const createInputHash = useCallback((input: PricingInput): string => {
    return JSON.stringify(input);
  }, []);

  // Current input
  const currentInput = useMemo((): PricingInput => ({
    treeCounts,
    modifiers,
    cleanup,
    timeEstimate,
  }), [treeCounts, modifiers, cleanup, timeEstimate]);

  // Fetch preview with debouncing
  useEffect(() => {
    if (totalTreeCount === 0) {
      setPreviewResult(null);
      setLastInputHash(''); // Clear hash so next calculation isn't stale
      return;
    }

    const inputHash = createInputHash(currentInput);
    if (inputHash === lastInputHash) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await apiRequest('POST', '/api/estimates/pricing/preview', currentInput);
        const result = await response.json();
        setPreviewResult(result);
        setLastInputHash(inputHash);
      } catch (error) {
        console.error('Preview calculation failed:', error);
        setLastInputHash(''); // Clear hash on error to allow retry
        toast({
          title: "Calculation error",
          description: "Unable to calculate pricing. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timeoutId);
  }, [currentInput, totalTreeCount, createInputHash, lastInputHash, toast]);

  // Handle tree count change
  const handleTreeCountChange = (size: TreeSize, value: number) => {
    setTreeCounts(prev => ({ ...prev, [size]: value }));
  };

  // Handle modifier toggle
  const handleModifierToggle = (key: RiskModifierKey) => {
    setModifiers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Continue to estimate builder
  const handleContinue = () => {
    if (!previewResult) {
      toast({
        title: "No pricing calculated",
        description: "Please add at least one tree to continue.",
        variant: "destructive",
      });
      return;
    }

    // Store preview result in sessionStorage for EstimateBuilder to consume
    sessionStorage.setItem('pricingToolResult', JSON.stringify({
      input: currentInput,
      result: previewResult,
    }));

    setLocation('/estimates/new?fromPricingTool=true');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">
            Pricing Tool
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Quick pricing calculator for tree service estimates
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column - Inputs */}
        <div className="space-y-6">
          {/* Tree Counts */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TreeDeciduous className="h-5 w-5" />
                Tree Sizes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {TREE_SIZES.map((size) => (
                <TreeCounter
                  key={size.key}
                  label={size.label}
                  hint={size.hint}
                  value={treeCounts[size.key]}
                  onChange={(value) => handleTreeCountChange(size.key, value)}
                  testIdPrefix={`tree-${size.key}`}
                />
              ))}
            </CardContent>
          </Card>

          {/* Risk Modifiers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Site Conditions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {RISK_MODIFIERS.map((modifier) => {
                const Icon = modifier.icon;
                return (
                  <div 
                    key={modifier.key} 
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor={modifier.key} className="text-sm cursor-pointer">
                        {modifier.label}
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        +{modifier.percentage}%
                      </Badge>
                    </div>
                    <Switch
                      id={modifier.key}
                      checked={modifiers[modifier.key] || false}
                      onCheckedChange={() => handleModifierToggle(modifier.key)}
                      data-testid={`switch-${modifier.key}`}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Cleanup Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cleanup & Extras</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Stump Grinding</Label>
                <Select
                  value={cleanup.stumpGrinding}
                  onValueChange={(value: 'none' | 'small' | 'large') => 
                    setCleanup(prev => ({ ...prev, stumpGrinding: value }))
                  }
                >
                  <SelectTrigger data-testid="select-stump-grinding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No stump grinding</SelectItem>
                    <SelectItem value="small">Small stumps (under 12")</SelectItem>
                    <SelectItem value="large">Large stumps (12"+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Discount options:</p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="keepFirewood" className="text-sm cursor-pointer">
                    Customer keeps firewood
                    <Badge variant="secondary" className="ml-2 text-xs">
                      -15%
                    </Badge>
                  </Label>
                  <Switch
                    id="keepFirewood"
                    checked={cleanup.keepFirewood}
                    onCheckedChange={(checked) => 
                      setCleanup(prev => ({ ...prev, keepFirewood: checked }))
                    }
                    data-testid="switch-keep-firewood"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="keepBrush" className="text-sm cursor-pointer">
                    Customer keeps brush
                    <Badge variant="secondary" className="ml-2 text-xs">
                      -10%
                    </Badge>
                  </Label>
                  <Switch
                    id="keepBrush"
                    checked={cleanup.keepBrush}
                    onCheckedChange={(checked) => 
                      setCleanup(prev => ({ ...prev, keepBrush: checked }))
                    }
                    data-testid="switch-keep-brush"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Time Estimate */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Time Estimate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {(['half', 'full', 'multi'] as const).map((time) => (
                  <Button
                    key={time}
                    variant={timeEstimate === time ? 'default' : 'outline'}
                    className="w-full"
                    onClick={() => setTimeEstimate(time)}
                    data-testid={`button-time-${time}`}
                  >
                    {time === 'half' && 'Half Day'}
                    {time === 'full' && 'Full Day'}
                    {time === 'multi' && 'Multi-Day'}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Preview */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Price Preview
                {isLoading && (
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {totalTreeCount === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TreeDeciduous className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Add trees to see pricing</p>
                </div>
              ) : isLoading && !previewResult ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              ) : previewResult ? (
                <>
                  {/* Summary */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Trees</span>
                      <span>{previewResult.meta.totalTreeCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Labor Hours</span>
                      <span>{previewResult.meta.totalLaborHours}h</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Crew Days</span>
                      <span>{previewResult.meta.crewDays}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Applied modifiers */}
                  {previewResult.modifiers.applied.length > 0 && (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          Adjustments Applied
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {previewResult.modifiers.applied.map((mod, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {mod}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* Pricing */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span data-testid="text-subtotal">
                        {formatCurrency(previewResult.totals.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>{formatCurrency(previewResult.totals.tax)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-xl font-bold">
                      <span>Total</span>
                      <span data-testid="text-total">
                        {formatCurrency(previewResult.totals.total)}
                      </span>
                    </div>
                  </div>

                  <Button 
                    className="w-full mt-4" 
                    size="lg"
                    onClick={handleContinue}
                    data-testid="button-continue-to-estimate"
                  >
                    Continue to Estimate
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
