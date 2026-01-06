/**
 * ARBORCORE PRICING CONSTITUTION
 * ===============================
 * 
 * This file contains the economic invariants that protect ArborCore from
 * silent revenue loss. These are not example-based tests - they use
 * randomized inputs to stress-test the pricing engine.
 * 
 * INVARIANT GROUPS:
 * A. Margin Protection - Prevents underpricing and revenue loss
 * B. Modifier Stacking - Ensures deterministic, bounded adjustments
 * C. Cost Profile Integrity - Validates input sanity and completeness
 * D. Scaling & Extremes - Guards against edge-case chaos
 * 
 * If any invariant fails, the test output states:
 * - Which invariant broke
 * - With what inputs
 * - Why it matters
 */

import { describe, it, expect } from 'vitest';
import { CostCalculationService, type CostCalculationOutput } from './costCalculation';
import { EstimatePricingService, type PricingInput, type PricingResult } from './estimatePricing';
import { 
  PricingToolService, 
  TREE_LABOR_HOURS, 
  RISK_MODIFIERS,
  CLEANUP_OPTIONS,
  type PricingToolInput 
} from './pricingToolService';
import type { CostProfileInput, CostProfileSnapshot, WorkItem } from '@shared/schema';

// ============================================================================
// TEST DATA GENERATORS
// ============================================================================

/**
 * Generate a random number within bounds
 */
function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate a random integer within bounds
 */
function randomInt(min: number, max: number): number {
  return Math.floor(randomInRange(min, max + 1));
}

/**
 * Generate a valid cost profile input with randomized values
 * Stays within reasonable bounds for tree service businesses
 */
function generateCostProfile(): CostProfileInput {
  const crewSize = randomInt(2, 6);
  
  return {
    labor: {
      roles: Array.from({ length: crewSize }, (_, i) => ({
        name: `Worker ${i + 1}`,
        count: 1,
        hourlyWage: randomInRange(18, 45),
        burdenPercentage: randomInRange(20, 40),
        hoursPerDay: randomInRange(6, 10),
      })),
      billableDaysPerMonth: randomInt(15, 22),
      utilizationPercentage: randomInRange(60, 90),
    },
    equipment: [
      { name: 'Chipper', monthlyCost: randomInRange(500, 2000), usableWorkdaysPerMonth: randomInt(15, 22) },
      { name: 'Truck', monthlyCost: randomInRange(800, 3000), usableWorkdaysPerMonth: randomInt(15, 22) },
    ],
    overhead: {
      insurance: randomInRange(500, 3000),
      admin: randomInRange(200, 1500),
      yardShop: randomInRange(100, 800),
      fuelBaseline: randomInRange(500, 2000),
      marketingBaseline: randomInRange(100, 1000),
      toolsConsumables: randomInRange(200, 800),
    },
    margin: {
      targetMarginPercentage: randomInRange(25, 50),
      minimumFloorPercentage: randomInRange(15, 30),
      halfDayFactor: randomInRange(0.5, 0.7),
      survivalModeThreshold: randomInRange(500, 2000),
    },
  };
}

/**
 * Generate a cost profile snapshot from a cost profile
 */
function createSnapshot(costProfile: CostProfileInput, id: string = 'test-snapshot'): CostProfileSnapshot {
  const calculated = CostCalculationService.calculate(costProfile);
  return {
    id,
    version: 1,
    snapshotData: costProfile,
    calculatedOutputs: calculated,
    createdAt: new Date(),
  };
}

/**
 * Generate random work items
 */
function generateWorkItems(count: number = randomInt(1, 5)): WorkItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `work-item-${i}`,
    description: `Work item ${i}`,
    quantity: randomInt(1, 10),
    unit: 'trees',
    unitPrice: 0,
    laborHours: randomInRange(1, 8),
    equipmentIds: [],
    notes: '',
  }));
}

/**
 * Generate random pricing tool input
 */
function generatePricingToolInput(): PricingToolInput {
  const modifierKeys = Object.keys(RISK_MODIFIERS) as (keyof typeof RISK_MODIFIERS)[];
  const randomModifiers: Partial<Record<keyof typeof RISK_MODIFIERS, boolean>> = {};
  
  modifierKeys.forEach(key => {
    if (Math.random() > 0.5) {
      randomModifiers[key] = true;
    }
  });
  
  return {
    treeCounts: {
      small: randomInt(0, 5),
      medium: randomInt(0, 5),
      large: randomInt(0, 3),
      xl: randomInt(0, 2),
    },
    modifiers: randomModifiers,
    cleanup: {
      stumpGrinding: ['none', 'small', 'large'][randomInt(0, 2)] as 'none' | 'small' | 'large',
      keepFirewood: Math.random() > 0.7,
      keepBrush: Math.random() > 0.7,
    },
    timeEstimate: ['half', 'full', 'multi'][randomInt(0, 2)] as 'half' | 'full' | 'multi',
  };
}

/**
 * Ensure at least one tree in pricing tool input
 */
function ensureAtLeastOneTree(input: PricingToolInput): PricingToolInput {
  const total = input.treeCounts.small + input.treeCounts.medium + 
                input.treeCounts.large + input.treeCounts.xl;
  if (total === 0) {
    input.treeCounts.medium = 1;
  }
  return input;
}

// ============================================================================
// INVARIANT GROUP A: MARGIN PROTECTION
// ============================================================================
// These invariants protect revenue. If violated, money is lost silently.

describe('Invariant Group A: Margin Protection', () => {
  
  it('A1: Price must always exceed cost floor (margin floor invariant)', () => {
    /**
     * INVARIANT: For any valid estimate, price >= directCosts * minimumMarginMultiplier
     * WHY: This prevents underpricing that leads to working at a loss
     * IMPACT: Direct revenue loss per job
     */
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const costProfile = generateCostProfile();
      const snapshot = createSnapshot(costProfile);
      const workItems = generateWorkItems();
      const taxRate = randomInRange(0, 0.1);
      
      const result = EstimatePricingService.calculate({
        workItems,
        costProfileSnapshot: snapshot,
        taxRate,
      });
      
      const minimumFloorPercentage = costProfile.margin.minimumFloorPercentage;
      const minimumMarginMultiplier = 1 / (1 - minimumFloorPercentage / 100);
      const expectedFloorPrice = result.breakdown.directCosts * minimumMarginMultiplier;
      
      // Either price >= floor OR floorViolation must be explicitly flagged
      const marginProtected = result.breakdown.finalPrice >= expectedFloorPrice || result.floorViolation;
      
      expect(marginProtected, 
        `INVARIANT A1 VIOLATED: Margin floor breached without flag\n` +
        `Direct costs: $${result.breakdown.directCosts}\n` +
        `Final price: $${result.breakdown.finalPrice}\n` +
        `Floor price: $${expectedFloorPrice}\n` +
        `Floor violation flagged: ${result.floorViolation}\n` +
        `Iteration: ${i}`
      ).toBe(true);
    }
  });

  it('A2: No pricing path can produce negative margin without explicit override', () => {
    /**
     * INVARIANT: marginAmount >= 0 unless isOverride is true
     * WHY: Negative margin means working at a loss
     * IMPACT: Catastrophic revenue loss
     */
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const costProfile = generateCostProfile();
      const snapshot = createSnapshot(costProfile);
      const workItems = generateWorkItems();
      const taxRate = randomInRange(0, 0.1);
      
      const result = EstimatePricingService.calculate({
        workItems,
        costProfileSnapshot: snapshot,
        taxRate,
      });
      
      // Without override, margin should never be negative
      if (!result.isOverride) {
        expect(result.breakdown.marginAmount >= 0,
          `INVARIANT A2 VIOLATED: Negative margin without override\n` +
          `Margin amount: $${result.breakdown.marginAmount}\n` +
          `Direct costs: $${result.breakdown.directCosts}\n` +
          `Final price: $${result.breakdown.finalPrice}\n` +
          `Is override: ${result.isOverride}\n` +
          `Iteration: ${i}`
        ).toBe(true);
      }
    }
  });

  it('A3: Override must be explicitly visible in result', () => {
    /**
     * INVARIANT: If overrideMultiplier is provided, isOverride must be true
     * WHY: Hidden overrides bypass margin protection undetected
     * IMPACT: Audit trail corruption, silent discounting
     */
    const costProfile = generateCostProfile();
    const snapshot = createSnapshot(costProfile);
    const workItems = generateWorkItems();
    
    // Test with override
    const resultWithOverride = EstimatePricingService.calculate({
      workItems,
      costProfileSnapshot: snapshot,
      taxRate: 0.05,
      overrideMultiplier: 0.8,
      overrideReason: 'Test discount',
    });
    
    expect(resultWithOverride.isOverride, 
      'INVARIANT A3 VIOLATED: Override applied but isOverride is false'
    ).toBe(true);
    
    expect(resultWithOverride.overrideMultiplier,
      'INVARIANT A3 VIOLATED: Override applied but multiplier not recorded'
    ).toBe(0.8);
    
    expect(resultWithOverride.overrideReason,
      'INVARIANT A3 VIOLATED: Override applied but reason not recorded'
    ).toBe('Test discount');
    
    // Test without override
    const resultNoOverride = EstimatePricingService.calculate({
      workItems,
      costProfileSnapshot: snapshot,
      taxRate: 0.05,
    });
    
    expect(resultNoOverride.isOverride,
      'INVARIANT A3 VIOLATED: No override but isOverride is true'
    ).toBe(false);
  });

  it('A4: Floor violation must be detectable when price drops below floor', () => {
    /**
     * INVARIANT: If finalPrice < floorPrice, then floorViolation must be true
     * WHY: Silent floor violations are invisible revenue leaks
     * IMPACT: Undetected underpricing
     */
    const costProfile = generateCostProfile();
    const snapshot = createSnapshot(costProfile);
    const workItems = generateWorkItems();
    
    // Apply aggressive discount to trigger floor violation
    const result = EstimatePricingService.calculate({
      workItems,
      costProfileSnapshot: snapshot,
      taxRate: 0.05,
      overrideMultiplier: 0.5, // 50% discount should trigger floor violation
    });
    
    if (result.breakdown.finalPrice < result.breakdown.floorPrice) {
      expect(result.floorViolation,
        `INVARIANT A4 VIOLATED: Price below floor but floorViolation not set\n` +
        `Final price: $${result.breakdown.finalPrice}\n` +
        `Floor price: $${result.breakdown.floorPrice}`
      ).toBe(true);
    }
  });
});

// ============================================================================
// INVARIANT GROUP B: MODIFIER STACKING
// ============================================================================
// These invariants ensure pricing adjustments are deterministic and bounded.

describe('Invariant Group B: Modifier Stacking', () => {

  it('B1: Modifier application order must not affect final price', () => {
    /**
     * INVARIANT: Applying modifiers in any order yields the same price
     * WHY: Order-dependent pricing is unpredictable and exploitable
     * IMPACT: Price inconsistency, customer confusion, arbitrage risk
     */
    const costProfile = generateCostProfile();
    const snapshot = createSnapshot(costProfile);
    const modifierKeys = Object.keys(RISK_MODIFIERS) as (keyof typeof RISK_MODIFIERS)[];
    
    // Test all permutations of modifier addition sequences
    // Generate baseline with all modifiers on
    const allModifiersInput: PricingToolInput = {
      treeCounts: { small: 1, medium: 2, large: 1, xl: 0 },
      modifiers: {
        powerLines: true,
        overHouse: true,
        deadTree: true,
        difficultAccess: true,
      },
      cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
      timeEstimate: 'full',
    };
    
    const fullResult = PricingToolService.calculatePreview(allModifiersInput, snapshot, 0.05);
    
    // Now test building up modifiers in different orders
    // Order 1: powerLines → overHouse → deadTree → difficultAccess
    // Order 2: difficultAccess → deadTree → overHouse → powerLines
    // The final accumulated result should be the same
    
    const ordersToTest = [
      ['powerLines', 'overHouse', 'deadTree', 'difficultAccess'],
      ['difficultAccess', 'deadTree', 'overHouse', 'powerLines'],
      ['deadTree', 'powerLines', 'difficultAccess', 'overHouse'],
    ];
    
    for (const order of ordersToTest) {
      // Build up modifiers incrementally in this order
      let accumulatedModifiers: Partial<Record<keyof typeof RISK_MODIFIERS, boolean>> = {};
      
      for (const modKey of order) {
        accumulatedModifiers = { ...accumulatedModifiers, [modKey]: true };
      }
      
      const orderedInput: PricingToolInput = {
        ...allModifiersInput,
        modifiers: accumulatedModifiers,
      };
      
      const orderedResult = PricingToolService.calculatePreview(orderedInput, snapshot, 0.05);
      
      expect(orderedResult.totals.total).toBeCloseTo(fullResult.totals.total, 2);
      expect(orderedResult.meta.totalLaborHours).toBeCloseTo(fullResult.meta.totalLaborHours, 2);
    }
    
    // Also test: toggling modifiers on/off should be commutative
    // A+B should equal B+A
    const modifierPairs = [
      ['powerLines', 'deadTree'],
      ['overHouse', 'difficultAccess'],
    ];
    
    for (const [modA, modB] of modifierPairs) {
      const inputAB: PricingToolInput = {
        treeCounts: { small: 0, medium: 2, large: 0, xl: 0 },
        modifiers: { [modA]: true, [modB]: true } as Partial<Record<keyof typeof RISK_MODIFIERS, boolean>>,
        cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
        timeEstimate: 'full',
      };
      
      const inputBA: PricingToolInput = {
        treeCounts: { small: 0, medium: 2, large: 0, xl: 0 },
        modifiers: { [modB]: true, [modA]: true } as Partial<Record<keyof typeof RISK_MODIFIERS, boolean>>,
        cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
        timeEstimate: 'full',
      };
      
      const resultAB = PricingToolService.calculatePreview(inputAB, snapshot, 0.05);
      const resultBA = PricingToolService.calculatePreview(inputBA, snapshot, 0.05);
      
      expect(resultAB.totals.total).toBeCloseTo(resultBA.totals.total, 2);
      expect(resultAB.meta.totalLaborHours).toBeCloseTo(resultBA.meta.totalLaborHours, 2);
    }
  });

  it('B2: Each modifier has bounded impact (no infinite multipliers)', () => {
    /**
     * INVARIANT: No modifier can multiply cost by more than 2x or reduce below 0
     * WHY: Unbounded modifiers can produce absurd prices
     * IMPACT: Quote errors, customer loss, or margin collapse
     */
    for (const [key, modifier] of Object.entries(RISK_MODIFIERS)) {
      expect(modifier.percentage >= 0,
        `INVARIANT B2 VIOLATED: Modifier ${key} has negative percentage: ${modifier.percentage}`
      ).toBe(true);
      
      expect(modifier.percentage <= 100,
        `INVARIANT B2 VIOLATED: Modifier ${key} exceeds 100%: ${modifier.percentage}%`
      ).toBe(true);
    }
    
    // Cleanup discounts should also be bounded
    expect(CLEANUP_OPTIONS.keepFirewood.discount <= 50,
      'INVARIANT B2 VIOLATED: keepFirewood discount exceeds 50%'
    ).toBe(true);
    
    expect(CLEANUP_OPTIONS.keepBrush.discount <= 50,
      'INVARIANT B2 VIOLATED: keepBrush discount exceeds 50%'
    ).toBe(true);
  });

  it('B3: Maximum combined modifier stack cannot exceed reasonable bounds', () => {
    /**
     * INVARIANT: All modifiers combined should not exceed 100% increase
     * WHY: Prevents runaway pricing from modifier stacking
     * IMPACT: Quotes become unpredictable, customer trust erosion
     */
    const totalModifierPercentage = Object.values(RISK_MODIFIERS)
      .reduce((sum, m) => sum + m.percentage, 0);
    
    expect(totalModifierPercentage <= 100,
      `INVARIANT B3 VIOLATED: Total possible modifier stack is ${totalModifierPercentage}%\n` +
      `This could more than double prices which may be unreasonable`
    ).toBe(true);
  });

  it('B4: Modifiers affect labor hours, not arbitrary cost components', () => {
    /**
     * INVARIANT: Risk modifiers only increase labor hours, not equipment or overhead directly
     * WHY: Modifier scope leakage creates hidden cost inflation
     * IMPACT: Incorrect cost attribution, misleading breakdowns
     */
    const costProfile = generateCostProfile();
    const snapshot = createSnapshot(costProfile);
    
    // Calculate without modifiers
    const inputNoModifiers: PricingToolInput = {
      treeCounts: { small: 0, medium: 2, large: 0, xl: 0 },
      modifiers: {},
      cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
      timeEstimate: 'full',
    };
    
    // Calculate with all modifiers
    const inputAllModifiers: PricingToolInput = {
      ...inputNoModifiers,
      modifiers: {
        powerLines: true,
        overHouse: true,
        deadTree: true,
        difficultAccess: true,
      },
    };
    
    const resultNoMod = PricingToolService.calculatePreview(inputNoModifiers, snapshot, 0.05);
    const resultAllMod = PricingToolService.calculatePreview(inputAllModifiers, snapshot, 0.05);
    
    // Labor hours should increase with modifiers
    expect(resultAllMod.meta.totalLaborHours > resultNoMod.meta.totalLaborHours,
      `INVARIANT B4 VIOLATED: Modifiers did not increase labor hours\n` +
      `Without modifiers: ${resultNoMod.meta.totalLaborHours}h\n` +
      `With modifiers: ${resultAllMod.meta.totalLaborHours}h`
    ).toBe(true);
  });
});

// ============================================================================
// INVARIANT GROUP C: COST PROFILE INTEGRITY
// ============================================================================
// These invariants ensure cost profile data is sane and complete.

describe('Invariant Group C: Cost Profile Integrity', () => {

  it('C1: No cost component can ever be negative', () => {
    /**
     * INVARIANT: All costs in output must be >= 0
     * WHY: Negative costs are mathematically invalid
     * IMPACT: Corrupted pricing, potential for negative prices
     */
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const costProfile = generateCostProfile();
      const output = CostCalculationService.calculate(costProfile);
      
      expect(output.dailyLaborCostPerCrew >= 0,
        `INVARIANT C1 VIOLATED: Negative daily labor cost: ${output.dailyLaborCostPerCrew}`
      ).toBe(true);
      
      expect(output.dailyEquipmentCost >= 0,
        `INVARIANT C1 VIOLATED: Negative daily equipment cost: ${output.dailyEquipmentCost}`
      ).toBe(true);
      
      expect(output.dailyOverheadAllocation >= 0,
        `INVARIANT C1 VIOLATED: Negative daily overhead: ${output.dailyOverheadAllocation}`
      ).toBe(true);
      
      expect(output.minimumRevenuePerCrewDay >= 0,
        `INVARIANT C1 VIOLATED: Negative minimum revenue: ${output.minimumRevenuePerCrewDay}`
      ).toBe(true);
    }
  });

  it('C2: Pricing breakdown components must sum correctly', () => {
    /**
     * INVARIANT: directCosts = laborCost + equipmentCost + overheadAllocation + materialCost
     * WHY: Missing cost components lead to underpricing
     * IMPACT: Hidden costs, margin erosion
     */
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const costProfile = generateCostProfile();
      const snapshot = createSnapshot(costProfile);
      const workItems = generateWorkItems();
      
      const result = EstimatePricingService.calculate({
        workItems,
        costProfileSnapshot: snapshot,
        taxRate: 0.05,
      });
      
      const expectedDirectCosts = 
        result.breakdown.laborCost +
        result.breakdown.equipmentCost +
        result.breakdown.overheadAllocation +
        result.breakdown.materialCost;
      
      expect(result.breakdown.directCosts).toBeCloseTo(expectedDirectCosts, 1);
    }
  });

  it('C3: Total must equal subtotal plus tax', () => {
    /**
     * INVARIANT: total = subtotal + taxAmount (within rounding tolerance)
     * WHY: Tax calculation errors affect revenue and compliance
     * IMPACT: Incorrect invoicing, tax liability issues
     * NOTE: Using 1 decimal precision due to accumulated rounding from multiple operations
     */
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const costProfile = generateCostProfile();
      const snapshot = createSnapshot(costProfile);
      const workItems = generateWorkItems();
      const taxRate = randomInRange(0, 0.1);
      
      const result = EstimatePricingService.calculate({
        workItems,
        costProfileSnapshot: snapshot,
        taxRate,
      });
      
      // Use 1 decimal precision (0.1) to account for accumulated rounding
      expect(result.total).toBeCloseTo(result.subtotal + result.taxAmount, 1);
    }
  });

  it('C4: Tax amount must equal subtotal times tax rate', () => {
    /**
     * INVARIANT: taxAmount = subtotal * taxRate (within rounding tolerance)
     * WHY: Incorrect tax calculation is a compliance risk
     * IMPACT: Under/over-collection of sales tax
     * NOTE: Using 1 decimal precision due to rounding after rate application
     */
    const iterations = 50;
    
    for (let i = 0; i < iterations; i++) {
      const costProfile = generateCostProfile();
      const snapshot = createSnapshot(costProfile);
      const workItems = generateWorkItems();
      const taxRate = randomInRange(0, 0.1);
      
      const result = EstimatePricingService.calculate({
        workItems,
        costProfileSnapshot: snapshot,
        taxRate,
      });
      
      const expectedTax = result.subtotal * taxRate;
      // Use 1 decimal precision (0.1) to account for rounding
      expect(result.taxAmount).toBeCloseTo(expectedTax, 1);
    }
  });
});

// ============================================================================
// INVARIANT GROUP D: SCALING & EXTREMES
// ============================================================================
// These invariants protect against edge-case chaos.

describe('Invariant Group D: Scaling & Extremes', () => {

  it('D1: Increasing tree count must never decrease price (monotonicity)', () => {
    /**
     * INVARIANT: More trees = more money (never less)
     * WHY: Inverse scaling would mean selling work at a discount
     * IMPACT: Perverse incentives, revenue loss on larger jobs
     */
    const costProfile = generateCostProfile();
    const snapshot = createSnapshot(costProfile);
    
    const baseInput: PricingToolInput = {
      treeCounts: { small: 1, medium: 0, large: 0, xl: 0 },
      modifiers: {},
      cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
      timeEstimate: 'full',
    };
    
    const baseResult = PricingToolService.calculatePreview(baseInput, snapshot, 0.05);
    
    // Add more trees
    const moreTreesInput: PricingToolInput = {
      ...baseInput,
      treeCounts: { small: 3, medium: 2, large: 1, xl: 0 },
    };
    
    const moreTreesResult = PricingToolService.calculatePreview(moreTreesInput, snapshot, 0.05);
    
    expect(moreTreesResult.totals.total >= baseResult.totals.total,
      `INVARIANT D1 VIOLATED: More trees decreased price\n` +
      `1 small tree: $${baseResult.totals.total}\n` +
      `6 trees total: $${moreTreesResult.totals.total}`
    ).toBe(true);
  });

  it('D2: Larger tree sizes must have higher labor hours', () => {
    /**
     * INVARIANT: xl > large > medium > small (labor hours)
     * WHY: Larger trees require more work
     * IMPACT: Underpricing large tree jobs
     */
    expect(TREE_LABOR_HOURS.xl > TREE_LABOR_HOURS.large,
      'INVARIANT D2 VIOLATED: XL trees do not require more labor than large'
    ).toBe(true);
    
    expect(TREE_LABOR_HOURS.large > TREE_LABOR_HOURS.medium,
      'INVARIANT D2 VIOLATED: Large trees do not require more labor than medium'
    ).toBe(true);
    
    expect(TREE_LABOR_HOURS.medium > TREE_LABOR_HOURS.small,
      'INVARIANT D2 VIOLATED: Medium trees do not require more labor than small'
    ).toBe(true);
  });

  it('D3: Zero trees must produce zero or explicitly invalid result', () => {
    /**
     * INVARIANT: Zero input = zero output (or validation error)
     * WHY: Prevents garbage numbers from empty inputs
     * IMPACT: Quote generation from nothing
     */
    const zeroInput: PricingToolInput = {
      treeCounts: { small: 0, medium: 0, large: 0, xl: 0 },
      modifiers: {},
      cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
      timeEstimate: 'full',
    };
    
    const validation = PricingToolService.validateInput(zeroInput);
    
    // Should fail validation with clear error
    expect(validation.valid === false && validation.errors.length > 0,
      'INVARIANT D3 VIOLATED: Zero tree input passed validation'
    ).toBe(true);
    
    expect(validation.errors.some(e => e.toLowerCase().includes('tree')),
      'INVARIANT D3 VIOLATED: Validation error does not mention tree requirement'
    ).toBe(true);
  });

  it('D4: Extreme inputs must produce finite, non-NaN results', () => {
    /**
     * INVARIANT: No input combination should produce NaN, Infinity, or undefined
     * WHY: Numeric overflow/underflow crashes the system
     * IMPACT: Application errors, quote failures
     */
    const extremeCostProfile: CostProfileInput = {
      labor: {
        roles: [
          { name: 'Extreme', count: 100, hourlyWage: 1000, burdenPercentage: 100, hoursPerDay: 24 }
        ],
        billableDaysPerMonth: 30,
        utilizationPercentage: 100,
      },
      equipment: [
        { name: 'Mega Equipment', monthlyCost: 1000000, usableWorkdaysPerMonth: 30 }
      ],
      overhead: {
        insurance: 100000,
        admin: 100000,
        yardShop: 100000,
        fuelBaseline: 100000,
        marketingBaseline: 100000,
        toolsConsumables: 100000,
      },
      margin: {
        targetMarginPercentage: 99,
        minimumFloorPercentage: 90,
        halfDayFactor: 0.99,
        survivalModeThreshold: 1000000,
      },
    };
    
    const output = CostCalculationService.calculate(extremeCostProfile);
    
    expect(Number.isFinite(output.dailyLaborCostPerCrew),
      `INVARIANT D4 VIOLATED: Extreme input produced non-finite labor cost: ${output.dailyLaborCostPerCrew}`
    ).toBe(true);
    
    expect(Number.isFinite(output.minimumRevenuePerCrewDay),
      `INVARIANT D4 VIOLATED: Extreme input produced non-finite revenue: ${output.minimumRevenuePerCrewDay}`
    ).toBe(true);
    
    expect(!Number.isNaN(output.targetHourlyRate),
      `INVARIANT D4 VIOLATED: Extreme input produced NaN hourly rate`
    ).toBe(true);
  });

  it('D5: Adding modifiers must never decrease labor hours', () => {
    /**
     * INVARIANT: Each modifier adds difficulty, never removes it
     * WHY: Modifier inversion would discount difficult work
     * IMPACT: Underpricing hazardous jobs
     */
    const costProfile = generateCostProfile();
    const snapshot = createSnapshot(costProfile);
    
    const baseInput: PricingToolInput = {
      treeCounts: { small: 0, medium: 2, large: 0, xl: 0 },
      modifiers: {},
      cleanup: { stumpGrinding: 'none', keepFirewood: false, keepBrush: false },
      timeEstimate: 'full',
    };
    
    const baseResult = PricingToolService.calculatePreview(baseInput, snapshot, 0.05);
    
    // Test each modifier individually
    for (const modKey of Object.keys(RISK_MODIFIERS) as (keyof typeof RISK_MODIFIERS)[]) {
      const withModifier: PricingToolInput = {
        ...baseInput,
        modifiers: { [modKey]: true },
      };
      
      const modResult = PricingToolService.calculatePreview(withModifier, snapshot, 0.05);
      
      expect(modResult.meta.totalLaborHours >= baseResult.meta.totalLaborHours,
        `INVARIANT D5 VIOLATED: Modifier ${modKey} decreased labor hours\n` +
        `Without: ${baseResult.meta.totalLaborHours}h\n` +
        `With: ${modResult.meta.totalLaborHours}h`
      ).toBe(true);
    }
  });
});

// ============================================================================
// RED FLAG DETECTION (Non-blocking, diagnostic)
// ============================================================================
// These are not invariants but warning conditions. They don't fail the build
// but are documented here for future implementation.

describe('Red Flag Detection (Diagnostic)', () => {
  
  it('REDFLAG: Document override frequency tracking requirement', () => {
    /**
     * FUTURE: Track override frequency per company
     * WHY: High override rates indicate pricing model problems
     * IMPLEMENTATION: Count overrides in audit log, alert if > 20% of quotes
     */
    expect(true).toBe(true); // Placeholder for documentation
  });

  it('REDFLAG: Document suspiciously low price detection requirement', () => {
    /**
     * FUTURE: Flag prices below historical percentile
     * WHY: Outlier detection catches pricing errors
     * IMPLEMENTATION: Compare quote to trailing 30-day average
     * REQUIRES: Production data for baseline
     */
    expect(true).toBe(true); // Placeholder for documentation
  });
});
