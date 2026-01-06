import type { WorkItem, CostProfileInput, PricingBreakdown, CostProfileSnapshot } from '@shared/schema';

export interface PricingInput {
  workItems: WorkItem[];
  costProfileSnapshot: CostProfileSnapshot;
  taxRate: number;
  overrideMultiplier?: number;
  overrideReason?: string;
}

export interface PricingResult {
  breakdown: PricingBreakdown;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  marginPercentage: number;
  floorViolation: boolean;
  isOverride: boolean;
  overrideMultiplier?: number;
  overrideReason?: string;
}

export class EstimatePricingService {
  static calculate(input: PricingInput): PricingResult {
    const { workItems, costProfileSnapshot, taxRate, overrideMultiplier, overrideReason } = input;

    const costProfile = costProfileSnapshot.snapshotData as CostProfileInput;
    const calculatedOutputs = costProfileSnapshot.calculatedOutputs as {
      dailyLaborCostPerCrew: number;
      dailyEquipmentCost: number;
      dailyOverheadAllocation: number;
      targetHourlyRate: number;
      breakEvenHourlyRate: number;
    };

    const totalLaborHours = workItems.reduce((sum, item) => sum + (item.laborHours || 0), 0);

    const crewHoursPerDay = costProfile.labor.roles.reduce((sum, r) => sum + r.hoursPerDay * r.count, 0);

    const laborDays = crewHoursPerDay > 0 ? totalLaborHours / crewHoursPerDay : 0;

    const laborCost = laborDays * calculatedOutputs.dailyLaborCostPerCrew;

    const allEquipmentIds = workItems.flatMap((item) => item.equipmentIds || []);
    const uniqueEquipmentIds = Array.from(new Set(allEquipmentIds));
    
    const equipmentCostPerDay = costProfile.equipment.reduce((sum, eq, index) => {
      if (uniqueEquipmentIds.includes(index.toString()) || uniqueEquipmentIds.includes(eq.name)) {
        const dailyCost = eq.usableWorkdaysPerMonth > 0 ? eq.monthlyCost / eq.usableWorkdaysPerMonth : 0;
        return sum + dailyCost;
      }
      return sum;
    }, 0);
    const equipmentCost = equipmentCostPerDay * Math.ceil(laborDays);

    const overheadAllocation = laborDays * calculatedOutputs.dailyOverheadAllocation;

    const materialCost = workItems.reduce((sum, item) => {
      return sum + item.quantity * item.unitPrice;
    }, 0);

    const directCosts = laborCost + equipmentCost + overheadAllocation + materialCost;

    const targetMarginPercentage = costProfile.margin.targetMarginPercentage;
    const minimumFloorPercentage = costProfile.margin.minimumFloorPercentage;

    const targetMarginMultiplier = 1 / (1 - targetMarginPercentage / 100);
    const minimumMarginMultiplier = 1 / (1 - minimumFloorPercentage / 100);

    const calculatedPrice = directCosts * targetMarginMultiplier;
    const floorPrice = directCosts * minimumMarginMultiplier;

    let finalPrice = calculatedPrice;
    let isOverride = false;

    if (overrideMultiplier !== undefined && overrideMultiplier > 0) {
      finalPrice = calculatedPrice * overrideMultiplier;
      isOverride = true;
    }

    const floorViolation = finalPrice < floorPrice;

    const marginAmount = finalPrice - directCosts;
    const actualMarginPercentage = finalPrice > 0 ? (marginAmount / finalPrice) * 100 : 0;

    const subtotal = finalPrice;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    const breakdown: PricingBreakdown = {
      laborCost: roundToTwoDecimals(laborCost),
      equipmentCost: roundToTwoDecimals(equipmentCost),
      overheadAllocation: roundToTwoDecimals(overheadAllocation),
      materialCost: roundToTwoDecimals(materialCost),
      directCosts: roundToTwoDecimals(directCosts),
      marginAmount: roundToTwoDecimals(marginAmount),
      floorPrice: roundToTwoDecimals(floorPrice),
      calculatedPrice: roundToTwoDecimals(calculatedPrice),
      finalPrice: roundToTwoDecimals(finalPrice),
      costProfileVersion: costProfileSnapshot.version,
    };

    return {
      breakdown,
      subtotal: roundToTwoDecimals(subtotal),
      taxRate: roundToFourDecimals(taxRate),
      taxAmount: roundToTwoDecimals(taxAmount),
      total: roundToTwoDecimals(total),
      marginPercentage: roundToTwoDecimals(actualMarginPercentage),
      floorViolation,
      isOverride,
      overrideMultiplier: isOverride ? overrideMultiplier : undefined,
      overrideReason: isOverride ? overrideReason : undefined,
    };
  }

  static calculateFromWorkItemsOnly(
    workItems: WorkItem[],
    taxRate: number
  ): { subtotal: number; taxAmount: number; total: number } {
    const subtotal = workItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return {
      subtotal: roundToTwoDecimals(subtotal),
      taxAmount: roundToTwoDecimals(taxAmount),
      total: roundToTwoDecimals(total),
    };
  }

  static validateWorkItems(workItems: unknown[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(workItems)) {
      return { valid: false, errors: ['Work items must be an array'] };
    }

    workItems.forEach((item, index) => {
      const wi = item as Partial<WorkItem>;
      if (!wi.id) errors.push(`Item ${index}: missing id`);
      if (!wi.description) errors.push(`Item ${index}: missing description`);
      if (typeof wi.quantity !== 'number' || wi.quantity <= 0) {
        errors.push(`Item ${index}: quantity must be a positive number`);
      }
      if (!wi.unit) errors.push(`Item ${index}: missing unit`);
      if (typeof wi.unitPrice !== 'number' || wi.unitPrice < 0) {
        errors.push(`Item ${index}: unitPrice must be a non-negative number`);
      }
      if (wi.laborHours !== undefined && (typeof wi.laborHours !== 'number' || wi.laborHours < 0)) {
        errors.push(`Item ${index}: laborHours must be a non-negative number`);
      }
    });

    return { valid: errors.length === 0, errors };
  }
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToFourDecimals(value: number): number {
  return Math.round(value * 10000) / 10000;
}
