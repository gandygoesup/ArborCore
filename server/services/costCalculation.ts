import type { CostProfileInput } from '@shared/schema';

export interface CostCalculationOutput {
  dailyLaborCostPerCrew: number;
  dailyEquipmentCost: number;
  dailyOverheadAllocation: number;
  minimumRevenuePerCrewDay: number;
  minimumRevenuePerHalfDay: number;
  suggestedMinimumJobCharge: number;
  breakEvenHourlyRate: number;
  targetHourlyRate: number;
  warnings: string[];
}

export class CostCalculationService {
  static calculate(input: CostProfileInput): CostCalculationOutput {
    const warnings: string[] = [];

    const dailyLaborCost = input.labor.roles.reduce((sum, role) => {
      const hourlyWithBurden = role.hourlyWage * (1 + role.burdenPercentage / 100);
      return sum + hourlyWithBurden * role.hoursPerDay * role.count;
    }, 0);

    const monthlyEquipmentCost = input.equipment.reduce((sum, eq) => sum + eq.monthlyCost, 0);
    const avgWorkdaysPerMonth = input.labor.billableDaysPerMonth;
    const dailyEquipmentCost = avgWorkdaysPerMonth > 0 ? monthlyEquipmentCost / avgWorkdaysPerMonth : 0;

    const monthlyOverhead =
      input.overhead.insurance +
      input.overhead.admin +
      input.overhead.yardShop +
      input.overhead.fuelBaseline +
      input.overhead.marketingBaseline +
      input.overhead.toolsConsumables;
    const dailyOverheadAllocation = avgWorkdaysPerMonth > 0 ? monthlyOverhead / avgWorkdaysPerMonth : 0;

    const totalDailyCost = dailyLaborCost + dailyEquipmentCost + dailyOverheadAllocation;

    const utilizationFactor = input.labor.utilizationPercentage / 100;
    const adjustedDailyCost = utilizationFactor > 0 ? totalDailyCost / utilizationFactor : totalDailyCost;

    const targetMarginMultiplier = 1 / (1 - input.margin.targetMarginPercentage / 100);
    const minimumMarginMultiplier = 1 / (1 - input.margin.minimumFloorPercentage / 100);

    const minimumRevenuePerCrewDay = adjustedDailyCost * minimumMarginMultiplier;
    const targetRevenuePerCrewDay = adjustedDailyCost * targetMarginMultiplier;
    const halfDayFactor = input.margin.halfDayFactor ?? 0.60;
    const minimumRevenuePerHalfDay = minimumRevenuePerCrewDay * halfDayFactor;

    const avgHoursPerDay =
      input.labor.roles.reduce((sum, r) => sum + r.hoursPerDay * r.count, 0) /
      Math.max(input.labor.roles.reduce((sum, r) => sum + r.count, 0), 1);

    const breakEvenHourlyRate = avgHoursPerDay > 0 ? adjustedDailyCost / avgHoursPerDay : 0;
    const targetHourlyRate = avgHoursPerDay > 0 ? targetRevenuePerCrewDay / avgHoursPerDay : 0;

    const suggestedMinimumJobCharge = minimumRevenuePerHalfDay * 0.75;

    if (minimumRevenuePerCrewDay < input.margin.survivalModeThreshold) {
      warnings.push('Minimum revenue is below survival threshold');
    }

    if (input.margin.targetMarginPercentage < 15) {
      warnings.push('Target margin below 15% may not be sustainable');
    }

    if (utilizationFactor < 0.6) {
      warnings.push('Low utilization rate increases effective costs');
    }

    return {
      dailyLaborCostPerCrew: Math.round(dailyLaborCost * 100) / 100,
      dailyEquipmentCost: Math.round(dailyEquipmentCost * 100) / 100,
      dailyOverheadAllocation: Math.round(dailyOverheadAllocation * 100) / 100,
      minimumRevenuePerCrewDay: Math.round(minimumRevenuePerCrewDay * 100) / 100,
      minimumRevenuePerHalfDay: Math.round(minimumRevenuePerHalfDay * 100) / 100,
      suggestedMinimumJobCharge: Math.round(suggestedMinimumJobCharge * 100) / 100,
      breakEvenHourlyRate: Math.round(breakEvenHourlyRate * 100) / 100,
      targetHourlyRate: Math.round(targetHourlyRate * 100) / 100,
      warnings,
    };
  }
}
