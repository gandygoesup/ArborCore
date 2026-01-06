import { describe, it, expect } from 'vitest';
import { EstimatePricingService, PricingInput } from './estimatePricing';
import type { WorkItem, CostProfileSnapshot } from '@shared/schema';

const createMockCostProfileSnapshot = (overrides = {}): CostProfileSnapshot => ({
  id: 'test-snapshot-id',
  companyId: 'test-company',
  version: 1,
  snapshotData: {
    labor: {
      roles: [
        { name: 'Arborist', hourlyWage: 25, hoursPerDay: 8, count: 2 }
      ],
      payrollTaxPercent: 10,
      insurancePercent: 5,
      benefitsPercent: 3
    },
    equipment: [
      { name: 'Chainsaw', monthlyCost: 500, usableWorkdaysPerMonth: 20 },
      { name: 'Truck', monthlyCost: 1000, usableWorkdaysPerMonth: 20 }
    ],
    overhead: {
      monthlyRent: 2000,
      utilities: 500,
      insurance: 300,
      software: 200,
      other: 500
    },
    margin: {
      targetMarginPercentage: 30,
      minimumFloorPercentage: 15
    }
  },
  calculatedOutputs: {
    dailyLaborCostPerCrew: 472,
    dailyEquipmentCost: 75,
    dailyOverheadAllocation: 175,
    targetHourlyRate: 75,
    breakEvenHourlyRate: 52.5
  },
  createdBy: 'test-user',
  createdAt: new Date(),
  ...overrides
});

const createMockWorkItem = (overrides = {}): WorkItem => ({
  id: 'item-1',
  description: 'Tree trimming',
  quantity: 1,
  unit: 'job',
  unitPrice: 500,
  laborHours: 8,
  equipmentIds: ['0'],
  ...overrides
});

describe('EstimatePricingService', () => {
  describe('calculate', () => {
    it('should calculate pricing with correct breakdown', () => {
      const input: PricingInput = {
        workItems: [createMockWorkItem()],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0.08
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.breakdown).toBeDefined();
      expect(result.subtotal).toBeGreaterThan(0);
      expect(result.taxAmount).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(result.subtotal);
      expect(result.marginPercentage).toBeGreaterThanOrEqual(0);
      expect(result.floorViolation).toBe(false);
      expect(result.isOverride).toBe(false);
    });

    it('should calculate labor cost based on work item hours', () => {
      const input: PricingInput = {
        workItems: [
          createMockWorkItem({ laborHours: 16 }),
        ],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.breakdown.laborCost).toBeGreaterThan(0);
    });

    it('should apply override multiplier when provided', () => {
      const baseInput: PricingInput = {
        workItems: [createMockWorkItem()],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0
      };

      const baseResult = EstimatePricingService.calculate(baseInput);

      const overrideInput: PricingInput = {
        ...baseInput,
        overrideMultiplier: 0.9,
        overrideReason: 'Customer discount'
      };

      const overrideResult = EstimatePricingService.calculate(overrideInput);

      expect(overrideResult.isOverride).toBe(true);
      expect(overrideResult.overrideMultiplier).toBe(0.9);
      expect(overrideResult.overrideReason).toBe('Customer discount');
      expect(overrideResult.breakdown.finalPrice).toBeLessThan(baseResult.breakdown.finalPrice);
    });

    it('should detect floor violation when price is below minimum', () => {
      const input: PricingInput = {
        workItems: [createMockWorkItem()],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0,
        overrideMultiplier: 0.5,
        overrideReason: 'Deep discount'
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.floorViolation).toBe(true);
    });

    it('should not have floor violation at normal pricing', () => {
      const input: PricingInput = {
        workItems: [createMockWorkItem()],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.floorViolation).toBe(false);
    });

    it('should include material cost in breakdown', () => {
      const input: PricingInput = {
        workItems: [
          createMockWorkItem({ quantity: 3, unitPrice: 200 })
        ],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.breakdown.materialCost).toBe(600);
    });

    it('should calculate tax correctly', () => {
      const input: PricingInput = {
        workItems: [createMockWorkItem()],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0.1
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.taxAmount).toBeCloseTo(result.subtotal * 0.1, 1);
      expect(result.total).toBeCloseTo(result.subtotal + result.taxAmount, 1);
    });

    it('should handle empty work items', () => {
      const input: PricingInput = {
        workItems: [],
        costProfileSnapshot: createMockCostProfileSnapshot(),
        taxRate: 0.08
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.breakdown.laborCost).toBe(0);
      expect(result.breakdown.materialCost).toBe(0);
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should track cost profile version in breakdown', () => {
      const input: PricingInput = {
        workItems: [createMockWorkItem()],
        costProfileSnapshot: createMockCostProfileSnapshot({ version: 5 }),
        taxRate: 0
      };

      const result = EstimatePricingService.calculate(input);

      expect(result.breakdown.costProfileVersion).toBe(5);
    });
  });

  describe('calculateFromWorkItemsOnly', () => {
    it('should calculate simple totals from work items', () => {
      const workItems: WorkItem[] = [
        createMockWorkItem({ quantity: 2, unitPrice: 100 }),
        createMockWorkItem({ id: 'item-2', quantity: 1, unitPrice: 250 })
      ];

      const result = EstimatePricingService.calculateFromWorkItemsOnly(workItems, 0.08);

      expect(result.subtotal).toBe(450);
      expect(result.taxAmount).toBe(36);
      expect(result.total).toBe(486);
    });
  });

  describe('validateWorkItems', () => {
    it('should validate valid work items', () => {
      const workItems = [createMockWorkItem()];
      const result = EstimatePricingService.validateWorkItems(workItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-array input', () => {
      const result = EstimatePricingService.validateWorkItems('not an array' as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Work items must be an array');
    });

    it('should catch missing required fields', () => {
      const workItems = [{ quantity: 1 }];
      const result = EstimatePricingService.validateWorkItems(workItems);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject negative quantity', () => {
      const workItems = [createMockWorkItem({ quantity: -1 })];
      const result = EstimatePricingService.validateWorkItems(workItems);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('quantity'))).toBe(true);
    });

    it('should reject negative unit price', () => {
      const workItems = [createMockWorkItem({ unitPrice: -100 })];
      const result = EstimatePricingService.validateWorkItems(workItems);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('unitPrice'))).toBe(true);
    });
  });
});
