import { describe, it, expect } from 'vitest';
import { CostCalculationService } from './costCalculation';
import type { CostProfileInput } from '@shared/schema';

const createMockInput = (overrides: Partial<CostProfileInput> = {}): CostProfileInput => ({
  labor: {
    roles: [
      { name: 'Arborist', hourlyWage: 50, burdenPercentage: 30, hoursPerDay: 8, count: 2 }
    ],
    utilizationPercentage: 80,
    billableDaysPerMonth: 20,
  },
  overhead: {
    insurance: 500,
    admin: 300,
    yardShop: 200,
    fuelBaseline: 400,
    marketingBaseline: 200,
    toolsConsumables: 100,
  },
  equipment: [
    { name: 'Truck', isOwned: true, monthlyCost: 800, usableWorkdaysPerMonth: 20 },
  ],
  margin: {
    targetMarginPercentage: 30,
    minimumFloorPercentage: 15,
    survivalModeThreshold: 500,
    halfDayFactor: 0.60,
    ...overrides.margin,
  },
  ...overrides,
});

describe('CostCalculationService', () => {
  describe('halfDayFactor compliance', () => {
    it('should calculate halfDayMin = crewDayMin * halfDayFactor (0.60)', () => {
      const result = CostCalculationService.calculate(createMockInput({
        margin: {
          targetMarginPercentage: 30,
          minimumFloorPercentage: 15,
          survivalModeThreshold: 500,
          halfDayFactor: 0.60,
        }
      }));

      const expectedHalfDay = result.minimumRevenuePerCrewDay * 0.60;
      expect(result.minimumRevenuePerHalfDay).toBeCloseTo(expectedHalfDay, 2);
    });

    it('should prove halfDayMin = crewDayMin * 0.60 (e.g., 1000 * 0.60 = 600)', () => {
      const result = CostCalculationService.calculate(createMockInput({
        margin: {
          targetMarginPercentage: 30,
          minimumFloorPercentage: 15,
          survivalModeThreshold: 500,
          halfDayFactor: 0.60,
        }
      }));
      
      const crewDayMin = result.minimumRevenuePerCrewDay;
      const halfDayMin = result.minimumRevenuePerHalfDay;
      
      expect(halfDayMin / crewDayMin).toBeCloseTo(0.60, 5);
      expect(halfDayMin).toBeCloseTo(crewDayMin * 0.60, 2);
    });

    it('should respect different halfDayFactor values (0.50)', () => {
      const result = CostCalculationService.calculate(createMockInput({
        margin: {
          targetMarginPercentage: 30,
          minimumFloorPercentage: 15,
          survivalModeThreshold: 500,
          halfDayFactor: 0.50,
        }
      }));

      const expectedHalfDay = result.minimumRevenuePerCrewDay * 0.50;
      expect(result.minimumRevenuePerHalfDay).toBeCloseTo(expectedHalfDay, 2);
    });

    it('should respect different halfDayFactor values (0.75)', () => {
      const result = CostCalculationService.calculate(createMockInput({
        margin: {
          targetMarginPercentage: 30,
          minimumFloorPercentage: 15,
          survivalModeThreshold: 500,
          halfDayFactor: 0.75,
        }
      }));

      const expectedHalfDay = result.minimumRevenuePerCrewDay * 0.75;
      expect(result.minimumRevenuePerHalfDay).toBeCloseTo(expectedHalfDay, 2);
    });

    it('should default to 0.60 when halfDayFactor is not provided', () => {
      const input = createMockInput();
      delete (input.margin as any).halfDayFactor;
      
      const result = CostCalculationService.calculate(input);

      const expectedHalfDay = result.minimumRevenuePerCrewDay * 0.60;
      expect(result.minimumRevenuePerHalfDay).toBeCloseTo(expectedHalfDay, 2);
    });
  });

  describe('basic calculations', () => {
    it('should calculate daily labor cost correctly', () => {
      const result = CostCalculationService.calculate(createMockInput());
      expect(result.dailyLaborCostPerCrew).toBeGreaterThan(0);
    });

    it('should calculate daily equipment cost correctly', () => {
      const result = CostCalculationService.calculate(createMockInput());
      expect(result.dailyEquipmentCost).toBeGreaterThan(0);
    });

    it('should calculate daily overhead correctly', () => {
      const result = CostCalculationService.calculate(createMockInput());
      expect(result.dailyOverheadAllocation).toBeGreaterThan(0);
    });

    it('should calculate minimum revenue per crew day', () => {
      const result = CostCalculationService.calculate(createMockInput());
      expect(result.minimumRevenuePerCrewDay).toBeGreaterThan(0);
    });

    it('should add warnings for low margin targets', () => {
      const result = CostCalculationService.calculate(createMockInput({
        margin: {
          targetMarginPercentage: 10,
          minimumFloorPercentage: 5,
          survivalModeThreshold: 500,
          halfDayFactor: 0.60,
        }
      }));
      expect(result.warnings).toContain('Target margin below 15% may not be sustainable');
    });
  });
});
