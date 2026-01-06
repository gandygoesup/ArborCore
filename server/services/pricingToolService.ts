import type { WorkItem, CostProfileSnapshot, CostProfileInput } from '@shared/schema';
import { EstimatePricingService, type PricingResult } from './estimatePricing';

// Tree size base pricing (in hours of labor per tree)
// These map to complexity/effort, not literal prices
export const TREE_LABOR_HOURS = {
  small: 1.5,    // ~under 30ft
  medium: 3,     // ~30-50ft
  large: 5,      // ~50-70ft
  xl: 8,         // ~70ft+
} as const;

// Risk/site condition modifiers (percentage adjustments)
export const RISK_MODIFIERS = {
  powerLines: { label: 'Power lines nearby', percentage: 15 },
  overHouse: { label: 'Over house/structure', percentage: 12 },
  deadTree: { label: 'Dead/hazard tree', percentage: 12 },
  difficultAccess: { label: 'Difficult access/limited workspace', percentage: 8 },
} as const;

export type RiskModifierKey = keyof typeof RISK_MODIFIERS;

// Cleanup options (additional work items)
export const CLEANUP_OPTIONS = {
  stumpGrinding: {
    none: { laborHours: 0, description: '' },
    small: { laborHours: 0.5, description: 'Stump grinding - small (under 12")' },
    large: { laborHours: 1.5, description: 'Stump grinding - large (12"+)' },
  },
  keepFirewood: { discount: 15, description: 'Customer keeps firewood on site' },
  keepBrush: { discount: 10, description: 'Customer keeps brush on site' },
} as const;

// Time estimates (affects total job calculation)
export const TIME_ESTIMATES = {
  half: { label: 'Half day', multiplier: 0.5, crewDays: 0.5 },
  full: { label: 'Full day', multiplier: 1, crewDays: 1 },
  multi: { label: 'Multi-day', multiplier: 2, crewDays: 2 },
} as const;

export type TimeEstimate = keyof typeof TIME_ESTIMATES;
export type StumpGrindingOption = keyof typeof CLEANUP_OPTIONS.stumpGrinding;

export interface PricingToolInput {
  treeCounts: {
    small: number;
    medium: number;
    large: number;
    xl: number;
  };
  modifiers: Partial<Record<RiskModifierKey, boolean>>;
  cleanup: {
    stumpGrinding: StumpGrindingOption;
    keepFirewood: boolean;
    keepBrush: boolean;
  };
  timeEstimate: TimeEstimate;
}

export interface PricingPreviewResult {
  workItems: WorkItem[];
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

export class PricingToolService {
  /**
   * Convert Pricing Tool inputs into work items and calculate preview pricing
   * This is ephemeral - no persistence, no audit logging
   */
  static calculatePreview(
    input: PricingToolInput,
    costProfileSnapshot: CostProfileSnapshot,
    taxRate: number
  ): PricingPreviewResult {
    const workItems: WorkItem[] = [];
    let workItemIndex = 0;

    // Calculate total tree count and base labor hours
    const { small, medium, large, xl } = input.treeCounts;
    const totalTreeCount = small + medium + large + xl;

    // Calculate base labor hours from tree counts
    let totalLaborHours = 
      small * TREE_LABOR_HOURS.small +
      medium * TREE_LABOR_HOURS.medium +
      large * TREE_LABOR_HOURS.large +
      xl * TREE_LABOR_HOURS.xl;

    // Calculate modifier percentage adjustment
    const appliedModifiers: string[] = [];
    let totalModifierPercentage = 0;

    Object.entries(input.modifiers).forEach(([key, enabled]) => {
      if (enabled && key in RISK_MODIFIERS) {
        const modifier = RISK_MODIFIERS[key as RiskModifierKey];
        totalModifierPercentage += modifier.percentage;
        appliedModifiers.push(modifier.label);
      }
    });

    // Apply modifiers to labor hours
    const adjustedLaborHours = totalLaborHours * (1 + totalModifierPercentage / 100);

    // Create tree removal work items by size
    if (small > 0) {
      workItems.push(this.createWorkItem(
        `tree-small-${workItemIndex++}`,
        `Tree removal - Small (under 30ft)`,
        small,
        'trees',
        small * TREE_LABOR_HOURS.small * (1 + totalModifierPercentage / 100),
        0 // Unit price calculated by pricing service
      ));
    }

    if (medium > 0) {
      workItems.push(this.createWorkItem(
        `tree-medium-${workItemIndex++}`,
        `Tree removal - Medium (30-50ft)`,
        medium,
        'trees',
        medium * TREE_LABOR_HOURS.medium * (1 + totalModifierPercentage / 100),
        0
      ));
    }

    if (large > 0) {
      workItems.push(this.createWorkItem(
        `tree-large-${workItemIndex++}`,
        `Tree removal - Large (50-70ft)`,
        large,
        'trees',
        large * TREE_LABOR_HOURS.large * (1 + totalModifierPercentage / 100),
        0
      ));
    }

    if (xl > 0) {
      workItems.push(this.createWorkItem(
        `tree-xl-${workItemIndex++}`,
        `Tree removal - Extra Large (70ft+)`,
        xl,
        'trees',
        xl * TREE_LABOR_HOURS.xl * (1 + totalModifierPercentage / 100),
        0
      ));
    }

    // Add stump grinding if selected
    const stumpOption = CLEANUP_OPTIONS.stumpGrinding[input.cleanup.stumpGrinding];
    if (stumpOption.laborHours > 0) {
      workItems.push(this.createWorkItem(
        `stump-${workItemIndex++}`,
        stumpOption.description,
        totalTreeCount, // One stump per tree
        'stumps',
        stumpOption.laborHours * totalTreeCount,
        0
      ));
    }

    // Calculate crew days based on time estimate
    const timeConfig = TIME_ESTIMATES[input.timeEstimate];
    const calculatedCrewDays = timeConfig.crewDays;

    // Use the existing pricing service to calculate
    const pricingResult = EstimatePricingService.calculate({
      workItems,
      costProfileSnapshot,
      taxRate,
      overrideMultiplier: undefined,
      overrideReason: undefined,
    });

    // Apply discounts for keeping materials on site
    let discountMultiplier = 1;
    if (input.cleanup.keepFirewood) {
      discountMultiplier -= CLEANUP_OPTIONS.keepFirewood.discount / 100;
      appliedModifiers.push(CLEANUP_OPTIONS.keepFirewood.description);
    }
    if (input.cleanup.keepBrush) {
      discountMultiplier -= CLEANUP_OPTIONS.keepBrush.discount / 100;
      appliedModifiers.push(CLEANUP_OPTIONS.keepBrush.description);
    }

    // Apply discounts to final pricing
    const adjustedSubtotal = pricingResult.subtotal * discountMultiplier;
    const adjustedTaxAmount = adjustedSubtotal * taxRate;
    const adjustedTotal = adjustedSubtotal + adjustedTaxAmount;

    return {
      workItems,
      totals: {
        subtotal: Math.round(adjustedSubtotal * 100) / 100,
        tax: Math.round(adjustedTaxAmount * 100) / 100,
        total: Math.round(adjustedTotal * 100) / 100,
      },
      modifiers: {
        applied: appliedModifiers,
        totalPercentageAdjustment: totalModifierPercentage,
      },
      meta: {
        crewDays: calculatedCrewDays,
        costProfileVersionId: costProfileSnapshot.id,
        timestamp: new Date().toISOString(),
        totalLaborHours: Math.round(adjustedLaborHours * 100) / 100,
        totalTreeCount,
      },
    };
  }

  private static createWorkItem(
    id: string,
    description: string,
    quantity: number,
    unit: string,
    laborHours: number,
    unitPrice: number
  ): WorkItem {
    return {
      id,
      description,
      quantity,
      unit,
      laborHours: Math.round(laborHours * 100) / 100,
      unitPrice,
      notes: '',
      equipmentIds: [],
    };
  }

  /**
   * Validate Pricing Tool input
   */
  static validateInput(input: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const data = input as Partial<PricingToolInput>;

    if (!data.treeCounts) {
      errors.push('treeCounts is required');
    } else {
      const { small, medium, large, xl } = data.treeCounts;
      
      // Validate integer counts
      if (typeof small !== 'number' || !Number.isInteger(small) || small < 0) {
        errors.push('treeCounts.small must be a non-negative integer');
      }
      if (typeof medium !== 'number' || !Number.isInteger(medium) || medium < 0) {
        errors.push('treeCounts.medium must be a non-negative integer');
      }
      if (typeof large !== 'number' || !Number.isInteger(large) || large < 0) {
        errors.push('treeCounts.large must be a non-negative integer');
      }
      if (typeof xl !== 'number' || !Number.isInteger(xl) || xl < 0) {
        errors.push('treeCounts.xl must be a non-negative integer');
      }
      
      const total = (small || 0) + (medium || 0) + (large || 0) + (xl || 0);
      if (total === 0) errors.push('At least one tree must be selected');
    }

    if (!data.modifiers || typeof data.modifiers !== 'object') {
      errors.push('modifiers must be an object');
    } else {
      // Validate modifier values are boolean
      for (const [key, value] of Object.entries(data.modifiers)) {
        if (value !== undefined && typeof value !== 'boolean') {
          errors.push(`modifiers.${key} must be a boolean`);
        }
      }
    }

    if (!data.cleanup) {
      errors.push('cleanup is required');
    } else {
      if (!['none', 'small', 'large'].includes(data.cleanup.stumpGrinding || '')) {
        errors.push('cleanup.stumpGrinding must be none, small, or large');
      }
      if (typeof data.cleanup.keepFirewood !== 'boolean') {
        errors.push('cleanup.keepFirewood must be a boolean');
      }
      if (typeof data.cleanup.keepBrush !== 'boolean') {
        errors.push('cleanup.keepBrush must be a boolean');
      }
    }

    if (!data.timeEstimate || !['half', 'full', 'multi'].includes(data.timeEstimate)) {
      errors.push('timeEstimate must be half, full, or multi');
    }

    return { valid: errors.length === 0, errors };
  }
}
