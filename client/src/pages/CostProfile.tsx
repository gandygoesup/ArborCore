import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Calculator, Save, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CostProfileSnapshot, CostProfileInput } from "@shared/schema";

const defaultInput: CostProfileInput = {
  labor: {
    roles: [
      { name: "Climber", hourlyWage: 25, burdenPercentage: 30, hoursPerDay: 8, count: 1 },
      { name: "Ground Worker", hourlyWage: 18, burdenPercentage: 30, hoursPerDay: 8, count: 1 },
    ],
    utilizationPercentage: 75,
    billableDaysPerMonth: 20,
  },
  overhead: {
    insurance: 2000,
    admin: 500,
    yardShop: 300,
    fuelBaseline: 800,
    marketingBaseline: 200,
    toolsConsumables: 400,
  },
  equipment: [
    { name: "Truck", isOwned: true, monthlyCost: 800, usableWorkdaysPerMonth: 20 },
    { name: "Chipper", isOwned: false, monthlyCost: 600, usableWorkdaysPerMonth: 20 },
  ],
  margin: {
    targetMarginPercentage: 35,
    minimumFloorPercentage: 20,
    survivalModeThreshold: 10000,
  },
};

interface CalculatedOutputs {
  dailyLaborCost: number;
  monthlyLaborCost: number;
  monthlyOverhead: number;
  dailyOverhead: number;
  dailyEquipmentCost: number;
  monthlyEquipmentCost: number;
  totalDailyCost: number;
  totalMonthlyCost: number;
  hourlyBreakeven: number;
  dailyBreakeven: number;
  targetHourlyRate: number;
  targetDailyRate: number;
}

export default function CostProfile() {
  const { toast } = useToast();
  const [input, setInput] = useState<CostProfileInput>(defaultInput);
  const [calculatedOutputs, setCalculatedOutputs] = useState<CalculatedOutputs | null>(null);

  const { data: latestSnapshot, isLoading: snapshotLoading } = useQuery<CostProfileSnapshot | null>({
    queryKey: ['/api/cost-profiles/latest'],
  });

  useEffect(() => {
    if (latestSnapshot?.snapshotData) {
      setInput(latestSnapshot.snapshotData as CostProfileInput);
      if (latestSnapshot.calculatedOutputs) {
        setCalculatedOutputs(latestSnapshot.calculatedOutputs as CalculatedOutputs);
      }
    }
  }, [latestSnapshot]);

  const calculateMutation = useMutation({
    mutationFn: async (data: CostProfileInput) => {
      const response = await apiRequest("POST", "/api/cost-profiles/calculate", data);
      return response.json();
    },
    onSuccess: (data) => {
      setCalculatedOutputs(data);
      toast({ title: "Calculation complete", description: "Review the results below." });
    },
    onError: (error: Error) => {
      toast({ title: "Calculation failed", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: CostProfileInput) => {
      const response = await apiRequest("POST", "/api/cost-profiles", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cost-profiles/latest'] });
      toast({ title: "Cost profile saved", description: "A new snapshot has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const updateLaborRole = (index: number, field: string, value: number | string) => {
    const newRoles = [...input.labor.roles];
    newRoles[index] = { ...newRoles[index], [field]: value };
    setInput({ ...input, labor: { ...input.labor, roles: newRoles } });
  };

  const addLaborRole = () => {
    setInput({
      ...input,
      labor: {
        ...input.labor,
        roles: [...input.labor.roles, { name: "", hourlyWage: 15, burdenPercentage: 30, hoursPerDay: 8, count: 1 }],
      },
    });
  };

  const removeLaborRole = (index: number) => {
    const newRoles = input.labor.roles.filter((_, i) => i !== index);
    setInput({ ...input, labor: { ...input.labor, roles: newRoles } });
  };

  const updateEquipment = (index: number, field: string, value: number | string | boolean) => {
    const newEquipment = [...input.equipment];
    newEquipment[index] = { ...newEquipment[index], [field]: value };
    setInput({ ...input, equipment: newEquipment });
  };

  const addEquipment = () => {
    setInput({
      ...input,
      equipment: [...input.equipment, { name: "", isOwned: true, monthlyCost: 0, usableWorkdaysPerMonth: 20 }],
    });
  };

  const removeEquipment = (index: number) => {
    const newEquipment = input.equipment.filter((_, i) => i !== index);
    setInput({ ...input, equipment: newEquipment });
  };

  const handleCalculate = () => {
    calculateMutation.mutate(input);
  };

  const handleSave = () => {
    if (!calculatedOutputs) {
      toast({ title: "Calculate first", description: "Please calculate costs before saving.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(input);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  if (snapshotLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" data-testid="text-page-title">Cost Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure your operating costs to calculate accurate job pricing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCalculate} disabled={calculateMutation.isPending} data-testid="button-calculate">
            <Calculator className="h-4 w-4 mr-2" />
            {calculateMutation.isPending ? "Calculating..." : "Calculate"}
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending || !calculatedOutputs} data-testid="button-save">
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Snapshot"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Labor Costs</CardTitle>
              <CardDescription>Define your crew roles and wages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {input.labor.roles.map((role, index) => (
                <div key={index} className="grid grid-cols-6 gap-3 items-end">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Role Name</Label>
                    <Input
                      value={role.name}
                      onChange={(e) => updateLaborRole(index, "name", e.target.value)}
                      placeholder="Role name"
                      data-testid={`input-role-name-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Hourly ($)</Label>
                    <Input
                      type="number"
                      value={role.hourlyWage}
                      onChange={(e) => updateLaborRole(index, "hourlyWage", parseFloat(e.target.value) || 0)}
                      data-testid={`input-hourly-wage-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Burden %</Label>
                    <Input
                      type="number"
                      value={role.burdenPercentage}
                      onChange={(e) => updateLaborRole(index, "burdenPercentage", parseFloat(e.target.value) || 0)}
                      data-testid={`input-burden-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Count</Label>
                    <Input
                      type="number"
                      value={role.count}
                      onChange={(e) => updateLaborRole(index, "count", parseInt(e.target.value) || 1)}
                      data-testid={`input-count-${index}`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLaborRole(index)}
                    disabled={input.labor.roles.length <= 1}
                    data-testid={`button-remove-role-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLaborRole} data-testid="button-add-role">
                <Plus className="h-4 w-4 mr-2" />
                Add Role
              </Button>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Utilization %</Label>
                  <Input
                    type="number"
                    value={input.labor.utilizationPercentage}
                    onChange={(e) => setInput({
                      ...input,
                      labor: { ...input.labor, utilizationPercentage: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-utilization"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Billable Days/Month</Label>
                  <Input
                    type="number"
                    value={input.labor.billableDaysPerMonth}
                    onChange={(e) => setInput({
                      ...input,
                      labor: { ...input.labor, billableDaysPerMonth: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-billable-days"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Monthly Overhead</CardTitle>
              <CardDescription>Fixed costs regardless of job volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Insurance</Label>
                  <Input
                    type="number"
                    value={input.overhead.insurance}
                    onChange={(e) => setInput({
                      ...input,
                      overhead: { ...input.overhead, insurance: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-insurance"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Admin</Label>
                  <Input
                    type="number"
                    value={input.overhead.admin}
                    onChange={(e) => setInput({
                      ...input,
                      overhead: { ...input.overhead, admin: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-admin"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Yard/Shop</Label>
                  <Input
                    type="number"
                    value={input.overhead.yardShop}
                    onChange={(e) => setInput({
                      ...input,
                      overhead: { ...input.overhead, yardShop: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-yard-shop"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fuel</Label>
                  <Input
                    type="number"
                    value={input.overhead.fuelBaseline}
                    onChange={(e) => setInput({
                      ...input,
                      overhead: { ...input.overhead, fuelBaseline: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-fuel"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Marketing</Label>
                  <Input
                    type="number"
                    value={input.overhead.marketingBaseline}
                    onChange={(e) => setInput({
                      ...input,
                      overhead: { ...input.overhead, marketingBaseline: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-marketing"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tools/Consumables</Label>
                  <Input
                    type="number"
                    value={input.overhead.toolsConsumables}
                    onChange={(e) => setInput({
                      ...input,
                      overhead: { ...input.overhead, toolsConsumables: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-tools"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Equipment</CardTitle>
              <CardDescription>Vehicles, machinery, and tools</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {input.equipment.map((eq, index) => (
                <div key={index} className="grid grid-cols-4 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={eq.name}
                      onChange={(e) => updateEquipment(index, "name", e.target.value)}
                      placeholder="Equipment name"
                      data-testid={`input-equipment-name-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Monthly Cost ($)</Label>
                    <Input
                      type="number"
                      value={eq.monthlyCost}
                      onChange={(e) => updateEquipment(index, "monthlyCost", parseFloat(e.target.value) || 0)}
                      data-testid={`input-equipment-cost-${index}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Workdays/Month</Label>
                    <Input
                      type="number"
                      value={eq.usableWorkdaysPerMonth}
                      onChange={(e) => updateEquipment(index, "usableWorkdaysPerMonth", parseFloat(e.target.value) || 1)}
                      data-testid={`input-equipment-days-${index}`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEquipment(index)}
                    disabled={input.equipment.length <= 1}
                    data-testid={`button-remove-equipment-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addEquipment} data-testid="button-add-equipment">
                <Plus className="h-4 w-4 mr-2" />
                Add Equipment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Margin Targets</CardTitle>
              <CardDescription>Your profit goals for pricing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Target Margin %</Label>
                  <Input
                    type="number"
                    value={input.margin.targetMarginPercentage}
                    onChange={(e) => setInput({
                      ...input,
                      margin: { ...input.margin, targetMarginPercentage: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-target-margin"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Minimum Floor %</Label>
                  <Input
                    type="number"
                    value={input.margin.minimumFloorPercentage}
                    onChange={(e) => setInput({
                      ...input,
                      margin: { ...input.margin, minimumFloorPercentage: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-floor-margin"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Survival Threshold ($)</Label>
                  <Input
                    type="number"
                    value={input.margin.survivalModeThreshold}
                    onChange={(e) => setInput({
                      ...input,
                      margin: { ...input.margin, survivalModeThreshold: parseFloat(e.target.value) || 0 }
                    })}
                    data-testid="input-survival-threshold"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="sticky top-8">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Calculated Results</CardTitle>
              <CardDescription>Server-computed cost breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {calculatedOutputs ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Daily Costs</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Labor:</span>
                      <span className="font-mono text-right" data-testid="output-daily-labor">{formatCurrency(calculatedOutputs.dailyLaborCost)}</span>
                      <span>Overhead:</span>
                      <span className="font-mono text-right" data-testid="output-daily-overhead">{formatCurrency(calculatedOutputs.dailyOverhead)}</span>
                      <span>Equipment:</span>
                      <span className="font-mono text-right" data-testid="output-daily-equipment">{formatCurrency(calculatedOutputs.dailyEquipmentCost)}</span>
                      <span className="font-semibold">Total:</span>
                      <span className="font-mono font-semibold text-right" data-testid="output-daily-total">{formatCurrency(calculatedOutputs.totalDailyCost)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Monthly Costs</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Labor:</span>
                      <span className="font-mono text-right" data-testid="output-monthly-labor">{formatCurrency(calculatedOutputs.monthlyLaborCost)}</span>
                      <span>Overhead:</span>
                      <span className="font-mono text-right" data-testid="output-monthly-overhead">{formatCurrency(calculatedOutputs.monthlyOverhead)}</span>
                      <span>Equipment:</span>
                      <span className="font-mono text-right" data-testid="output-monthly-equipment">{formatCurrency(calculatedOutputs.monthlyEquipmentCost)}</span>
                      <span className="font-semibold">Total:</span>
                      <span className="font-mono font-semibold text-right" data-testid="output-monthly-total">{formatCurrency(calculatedOutputs.totalMonthlyCost)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Breakeven Rates</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Hourly:</span>
                      <span className="font-mono text-right" data-testid="output-hourly-breakeven">{formatCurrency(calculatedOutputs.hourlyBreakeven)}</span>
                      <span>Daily:</span>
                      <span className="font-mono text-right" data-testid="output-daily-breakeven">{formatCurrency(calculatedOutputs.dailyBreakeven)}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Target Rates</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span>Hourly:</span>
                      <span className="font-mono font-semibold text-right text-primary" data-testid="output-target-hourly">{formatCurrency(calculatedOutputs.targetHourlyRate)}</span>
                      <span>Daily:</span>
                      <span className="font-mono font-semibold text-right text-primary" data-testid="output-target-daily">{formatCurrency(calculatedOutputs.targetDailyRate)}</span>
                    </div>
                  </div>

                  {latestSnapshot && (
                    <div className="mt-4 p-3 rounded-md bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        Last saved: Version {latestSnapshot.version} on {new Date(latestSnapshot.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Enter your costs and click Calculate</p>
                  <p className="text-xs mt-1">All calculations are performed on the server</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
