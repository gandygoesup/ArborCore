import { storage } from '../storage';
import type { 
  EstimateField, 
  PricingProfile, 
  PricingRule,
  WorkItem,
  PricingBreakdown,
  CostProfileInput
} from '@shared/schema';
import { CostCalculationService } from './costCalculation';

export interface EstimateInput {
  companyId: string;
  mode: 'internal' | 'marketing';
  customerId?: string;
  pricingProfileId?: string;
  inputs: Record<string, any>;
  workItems?: WorkItem[];
  options?: EstimateOptionInput[];
}

export interface EstimateOptionInput {
  name: string;
  inputs: Record<string, any>;
  workItems?: WorkItem[];
}

export interface AdjustmentDetail {
  ruleId: string;
  ruleName: string;
  fieldKey: string | null;
  effectType: string;
  effectValue: number;
  appliedAmount: number;
}

export interface DiscountDetail {
  type: 'percentage' | 'flat';
  value: number;
  reason: string;
  appliedAmount: number;
}

export interface PricingSnapshot {
  baseSubtotal: number;
  adjustments: AdjustmentDetail[];
  discounts: DiscountDetail[];
  adjustmentsTotal: number;
  discountsTotal: number;
  subtotalAfterAdjustments: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  depositAmount: number;
  depositPercentage: number;
  commissionAmount: number;
  commissionPercentage: number;
  marginPercentage: number;
  floorViolation: boolean;
  warnings: string[];
}

export interface EstimatePreviewResult {
  inputSnapshot: Record<string, any>;
  fieldsUsed: EstimateField[];
  pricingProfile: PricingProfile | null;
  pricingSnapshot: PricingSnapshot;
  workItemsSnapshot: WorkItem[];
  options?: EstimateOptionPreview[];
}

export interface EstimateOptionPreview {
  name: string;
  pricingSnapshot: PricingSnapshot;
  workItemsSnapshot: WorkItem[];
}

export class EstimateEngine {
  static async preview(input: EstimateInput): Promise<EstimatePreviewResult> {
    const { companyId, mode, pricingProfileId, inputs, workItems = [], options } = input;

    const fields = await storage.getEstimateFields(companyId);
    const applicableFields = fields.filter(f => 
      f.isActive && (f.appliesTo as string[]).includes(mode)
    );

    let profile: PricingProfile | null = null;
    if (pricingProfileId) {
      profile = (await storage.getPricingProfile(companyId, pricingProfileId)) ?? null;
    } else {
      profile = (await storage.getDefaultPricingProfile(companyId)) ?? null;
    }

    const rules = await storage.getPricingRules(companyId, profile?.id);
    const activeRules = rules.filter(r => r.isActive);

    const pricingSnapshot = this.calculatePricing(
      workItems,
      inputs,
      applicableFields,
      activeRules,
      profile
    );

    let optionPreviews: EstimateOptionPreview[] | undefined;
    if (options && options.length > 0) {
      optionPreviews = await Promise.all(
        options.map(async (opt) => {
          const optInputs = { ...inputs, ...opt.inputs };
          const optWorkItems = opt.workItems || workItems;
          const optPricing = this.calculatePricing(
            optWorkItems,
            optInputs,
            applicableFields,
            activeRules,
            profile
          );
          return {
            name: opt.name,
            pricingSnapshot: optPricing,
            workItemsSnapshot: optWorkItems,
          };
        })
      );
    }

    return {
      inputSnapshot: inputs,
      fieldsUsed: applicableFields,
      pricingProfile: profile,
      pricingSnapshot,
      workItemsSnapshot: workItems,
      options: optionPreviews,
    };
  }

  private static calculatePricing(
    workItems: WorkItem[],
    inputs: Record<string, any>,
    fields: EstimateField[],
    rules: PricingRule[],
    profile: PricingProfile | null
  ): PricingSnapshot {
    const warnings: string[] = [];

    const baseSubtotal = workItems.reduce((sum, item) => {
      return sum + item.quantity * item.unitPrice;
    }, 0);

    const adjustments: AdjustmentDetail[] = [];
    let adjustmentsTotal = 0;

    for (const rule of rules) {
      const field = rule.fieldId ? fields.find(f => f.id === rule.fieldId) : null;
      const fieldKey = field?.fieldKey || null;

      if (!this.shouldApplyRule(rule, inputs, fieldKey)) {
        continue;
      }

      let appliedAmount = 0;
      const effectValue = Number(rule.effectValue);

      switch (rule.effectType) {
        case 'flat':
          appliedAmount = effectValue;
          break;
        case 'percentage':
          appliedAmount = baseSubtotal * (effectValue / 100);
          break;
        case 'multiplier':
          appliedAmount = baseSubtotal * (effectValue - 1);
          break;
        case 'perUnit':
          const inputValue = fieldKey ? Number(inputs[fieldKey] || 0) : 0;
          appliedAmount = inputValue * effectValue;
          break;
      }

      if (appliedAmount !== 0) {
        adjustments.push({
          ruleId: rule.id,
          ruleName: rule.ruleName,
          fieldKey,
          effectType: rule.effectType,
          effectValue,
          appliedAmount: Math.round(appliedAmount * 100) / 100,
        });
        adjustmentsTotal += appliedAmount;
      }
    }

    const discounts: DiscountDetail[] = [];
    let discountsTotal = 0;

    const subtotalAfterAdjustments = baseSubtotal + adjustmentsTotal - discountsTotal;

    const taxRules = (profile?.taxRules as { defaultRate?: number }) || {};
    const taxRate = taxRules.defaultRate ?? 0;
    const taxAmount = subtotalAfterAdjustments * (taxRate / 100);
    const total = subtotalAfterAdjustments + taxAmount;

    const depositRules = (profile?.depositRules as { defaultPercentage?: number }) || {};
    const depositPercentage = depositRules.defaultPercentage ?? 0;
    const depositAmount = total * (depositPercentage / 100);

    const commissionRules = (profile?.commissionRules as { defaultPercentage?: number }) || {};
    const commissionPercentage = commissionRules.defaultPercentage ?? 0;
    const commissionAmount = subtotalAfterAdjustments * (commissionPercentage / 100);

    const estimatedCost = baseSubtotal * 0.6;
    const marginPercentage = subtotalAfterAdjustments > 0 
      ? ((subtotalAfterAdjustments - estimatedCost) / subtotalAfterAdjustments) * 100 
      : 0;

    const baseRates = (profile?.baseRates as { minimumFloorPercentage?: number }) || {};
    const minimumFloor = baseRates.minimumFloorPercentage ?? 15;
    const floorViolation = marginPercentage < minimumFloor;

    if (floorViolation) {
      warnings.push(`Margin ${marginPercentage.toFixed(1)}% is below floor of ${minimumFloor}%`);
    }

    return {
      baseSubtotal: Math.round(baseSubtotal * 100) / 100,
      adjustments,
      discounts,
      adjustmentsTotal: Math.round(adjustmentsTotal * 100) / 100,
      discountsTotal: Math.round(discountsTotal * 100) / 100,
      subtotalAfterAdjustments: Math.round(subtotalAfterAdjustments * 100) / 100,
      taxRate,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
      depositAmount: Math.round(depositAmount * 100) / 100,
      depositPercentage,
      commissionAmount: Math.round(commissionAmount * 100) / 100,
      commissionPercentage,
      marginPercentage: Math.round(marginPercentage * 100) / 100,
      floorViolation,
      warnings,
    };
  }

  private static shouldApplyRule(
    rule: PricingRule,
    inputs: Record<string, any>,
    fieldKey: string | null
  ): boolean {
    const appliesWhen = rule.appliesWhen as { 
      condition?: string; 
      value?: any;
      operator?: string;
    } | null;

    if (!appliesWhen || !appliesWhen.condition) {
      if (fieldKey) {
        const inputValue = inputs[fieldKey];
        return inputValue !== undefined && inputValue !== false && inputValue !== '' && inputValue !== 0;
      }
      return true;
    }

    const { condition, value, operator = 'equals' } = appliesWhen;
    const inputValue = inputs[condition];

    switch (operator) {
      case 'equals':
        return inputValue === value;
      case 'notEquals':
        return inputValue !== value;
      case 'greaterThan':
        return Number(inputValue) > Number(value);
      case 'lessThan':
        return Number(inputValue) < Number(value);
      case 'contains':
        return String(inputValue).includes(String(value));
      case 'isTrue':
        return inputValue === true;
      case 'isFalse':
        return inputValue === false;
      default:
        return false;
    }
  }

  static async finalize(
    companyId: string,
    estimateId: string,
    preview: EstimatePreviewResult,
    userId: string
  ): Promise<{ success: boolean; snapshotId: string }> {
    const estimate = await storage.getEstimateById(companyId, estimateId);
    if (!estimate) {
      throw new Error('Estimate not found');
    }

    if (estimate.companyId !== companyId) {
      throw new Error('Estimate not found');
    }

    if (estimate.status !== 'draft') {
      throw new Error('Only draft estimates can be finalized');
    }

    const costProfile = await storage.getLatestCostProfileSnapshot(estimate.companyId);
    if (!costProfile) {
      throw new Error('No cost profile found');
    }

    const snapshotCount = await storage.getEstimateSnapshotCount(estimateId);

    const pricingBreakdown: PricingBreakdown = {
      laborCost: preview.pricingSnapshot.baseSubtotal * 0.4,
      equipmentCost: preview.pricingSnapshot.baseSubtotal * 0.1,
      overheadAllocation: preview.pricingSnapshot.baseSubtotal * 0.1,
      materialCost: 0,
      directCosts: preview.pricingSnapshot.baseSubtotal * 0.6,
      marginAmount: preview.pricingSnapshot.subtotalAfterAdjustments * (preview.pricingSnapshot.marginPercentage / 100),
      floorPrice: preview.pricingSnapshot.baseSubtotal * 0.85,
      calculatedPrice: preview.pricingSnapshot.subtotalAfterAdjustments,
      finalPrice: preview.pricingSnapshot.total,
      costProfileVersion: costProfile.version,
    };

    const snapshot = await storage.createEstimateSnapshot({
      estimateId,
      snapshotVersion: snapshotCount + 1,
      triggerAction: 'finalize',
      costProfileSnapshotId: costProfile.id,
      workItemsSnapshot: preview.workItemsSnapshot,
      pricingBreakdown,
      subtotal: preview.pricingSnapshot.subtotalAfterAdjustments.toString(),
      taxRate: (preview.pricingSnapshot.taxRate / 100).toString(),
      taxAmount: preview.pricingSnapshot.taxAmount.toString(),
      total: preview.pricingSnapshot.total.toString(),
      marginPercentage: preview.pricingSnapshot.marginPercentage.toString(),
      isOverride: false,
      floorViolation: preview.pricingSnapshot.floorViolation,
      previousStatus: estimate.status,
      newStatus: 'draft',
      actorId: userId,
      actorType: 'user',
    });

    await storage.updateEstimate(companyId, estimateId, {
      pricingProfileId: preview.pricingProfile?.id || null,
      inputSnapshot: preview.inputSnapshot,
      pricingSnapshot: preview.pricingSnapshot,
      workItems: preview.workItemsSnapshot,
    });

    return { success: true, snapshotId: snapshot.id };
  }

  static async createWithEngine(
    companyId: string,
    userId: string,
    baseData: {
      customerId: string;
      propertyId?: string;
      leadId?: string;
      title?: string;
      description?: string;
      jobAddress?: string;
      validUntil?: Date;
    },
    engineInput: {
      pricingProfileId?: string;
      inputs: Record<string, any>;
      workItems: WorkItem[];
    }
  ): Promise<{ estimateId: string; previewResult: EstimatePreviewResult }> {
    const preview = await this.preview({
      companyId,
      mode: 'internal',
      pricingProfileId: engineInput.pricingProfileId,
      inputs: engineInput.inputs,
      workItems: engineInput.workItems,
    });

    const estimateNumber = await storage.generateEstimateNumber(companyId);

    const estimate = await storage.createEstimate({
      companyId,
      customerId: baseData.customerId,
      propertyId: baseData.propertyId,
      leadId: baseData.leadId,
      estimateNumber,
      status: 'draft',
      title: baseData.title,
      description: baseData.description,
      jobAddress: baseData.jobAddress,
      workItems: engineInput.workItems,
      pricingProfileId: engineInput.pricingProfileId || preview.pricingProfile?.id || null,
      inputSnapshot: preview.inputSnapshot,
      pricingSnapshot: preview.pricingSnapshot,
      validUntil: baseData.validUntil,
      createdBy: userId,
    });

    return {
      estimateId: estimate.id,
      previewResult: preview,
    };
  }
}
