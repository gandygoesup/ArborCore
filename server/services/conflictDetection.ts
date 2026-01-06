/**
 * Conflict Detection Service for Scheduling
 * 
 * DESIGN NOTES:
 * - This is a single-day scheduling system where each assignment/reservation 
 *   is scoped to a specific date with optional start/end times.
 * - Multi-day jobs should be represented as multiple single-day assignments
 *   (one per day the crew/equipment is needed).
 * - Times are normalized: missing start time defaults to 00:00, 
 *   missing end time defaults to 23:59.
 * - Conflicts are detected when time ranges overlap on the same date.
 * - Cross-midnight jobs: When endTime < startTime, the job spans to the next day.
 *   These are checked for conflicts on both the scheduled date (startTime-23:59)
 *   and the following day (00:00-endTime).
 * - Timezone support: All dates are converted to the company's local timezone
 *   for accurate conflict detection across different timezones.
 */

import { storage } from "../storage";
import type { CrewAssignment, EquipmentReservation } from "@shared/schema";
import { format, addDays, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export interface TimeRange {
  startTime?: string | null;
  endTime?: string | null;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictType?: "crew" | "equipment";
  conflictingAssignments?: CrewAssignment[];
  conflictingReservations?: EquipmentReservation[];
  message?: string;
}

export interface CrewConflictCheckParams {
  companyId: string;
  crewId: string;
  scheduledDate: Date;
  startTime?: string | null;
  endTime?: string | null;
  excludeAssignmentId?: string;
  timezone?: string;
}

export interface EquipmentConflictCheckParams {
  companyId: string;
  equipmentId: string;
  scheduledDate: Date;
  startTime?: string | null;
  endTime?: string | null;
  excludeReservationId?: string;
  timezone?: string;
}

export interface SchedulingContext {
  companyId: string;
  timezone: string;
}

const DEFAULT_TIMEZONE = "America/New_York";
const MINUTES_IN_DAY = 1440;

function parseTime(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function spansMidnight(startTime: string | null | undefined, endTime: string | null | undefined): boolean {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start === null || end === null) return false;
  return end < start;
}

function timeRangesOverlap(
  range1: TimeRange,
  range2: TimeRange
): boolean {
  const start1 = parseTime(range1.startTime);
  const end1 = parseTime(range1.endTime);
  const start2 = parseTime(range2.startTime);
  const end2 = parseTime(range2.endTime);

  const effectiveStart1 = start1 ?? 0;
  const effectiveEnd1 = end1 ?? MINUTES_IN_DAY;
  const effectiveStart2 = start2 ?? 0;
  const effectiveEnd2 = end2 ?? MINUTES_IN_DAY;

  const range1SpansMidnight = end1 !== null && start1 !== null && end1 < start1;
  const range2SpansMidnight = end2 !== null && start2 !== null && end2 < start2;

  if (!range1SpansMidnight && !range2SpansMidnight) {
    return effectiveStart1 < effectiveEnd2 && effectiveStart2 < effectiveEnd1;
  }

  if (range1SpansMidnight && !range2SpansMidnight) {
    return effectiveStart2 < effectiveEnd1 || effectiveStart1 < effectiveEnd2;
  }

  if (!range1SpansMidnight && range2SpansMidnight) {
    return effectiveStart1 < effectiveEnd2 || effectiveStart2 < effectiveEnd1;
  }

  return true;
}

function dateToEpochDays(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const refDate = Date.UTC(1970, 0, 1);
  const targetDate = Date.UTC(year, month - 1, day);
  return Math.floor((targetDate - refDate) / (1000 * 60 * 60 * 24));
}

interface AbsoluteTimeRange {
  startMinute: number;
  endMinute: number;
}

function toAbsoluteTimeRange(
  dateStr: string,
  range: TimeRange
): AbsoluteTimeRange {
  const baseDayMinutes = dateToEpochDays(dateStr) * MINUTES_IN_DAY;
  const start = parseTime(range.startTime) ?? 0;
  const end = parseTime(range.endTime) ?? MINUTES_IN_DAY;
  
  const spansToNextDay = end < start;
  
  return {
    startMinute: baseDayMinutes + start,
    endMinute: spansToNextDay 
      ? baseDayMinutes + MINUTES_IN_DAY + end 
      : baseDayMinutes + end,
  };
}

function absoluteRangesOverlap(r1: AbsoluteTimeRange, r2: AbsoluteTimeRange): boolean {
  return r1.startMinute < r2.endMinute && r2.startMinute < r1.endMinute;
}

function timeRangesOverlapCrossMidnight(
  range1: TimeRange,
  range1Date: string,
  range2: TimeRange,
  range2Date: string
): boolean {
  const abs1 = toAbsoluteTimeRange(range1Date, range1);
  const abs2 = toAbsoluteTimeRange(range2Date, range2);
  return absoluteRangesOverlap(abs1, abs2);
}

function normalizeDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function normalizeDateInTimezone(date: Date, timezone: string): string {
  try {
    const zonedDate = toZonedTime(date, timezone);
    return format(zonedDate, "yyyy-MM-dd");
  } catch {
    return normalizeDate(date);
  }
}

export function getLocalDate(utcDate: Date, timezone: string): Date {
  try {
    return toZonedTime(utcDate, timezone);
  } catch {
    return utcDate;
  }
}

export function toUTC(localDate: Date, timezone: string): Date {
  try {
    return fromZonedTime(localDate, timezone);
  } catch {
    return localDate;
  }
}

export function formatTimeForDisplay(time: string | null | undefined): string {
  if (!time) return "";
  const minutes = parseTime(time);
  if (minutes === null) return time;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
}

export function getDatesForCrossMidnightJob(
  scheduledDate: Date,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): { primaryDate: string; secondaryDate: string | null; previousDate: string } {
  const zonedDate = toZonedTime(scheduledDate, timezone);
  const primaryDate = format(zonedDate, "yyyy-MM-dd");
  
  const zonedPrevious = addDays(zonedDate, -1);
  const previousDate = format(zonedPrevious, "yyyy-MM-dd");
  
  if (spansMidnight(startTime, endTime)) {
    const zonedNext = addDays(zonedDate, 1);
    const secondaryDate = format(zonedNext, "yyyy-MM-dd");
    return { primaryDate, secondaryDate, previousDate };
  }
  
  return { primaryDate, secondaryDate: null, previousDate };
}

function getDateRangeForDay(dateStr: string, timezone: string): { startOfDay: Date; endOfDay: Date } {
  return {
    startOfDay: fromZonedTime(`${dateStr}T00:00:00`, timezone),
    endOfDay: fromZonedTime(`${dateStr}T23:59:59.999`, timezone),
  };
}

export class ConflictDetectionService {
  async checkCrewConflict(params: CrewConflictCheckParams): Promise<ConflictResult> {
    const { 
      companyId, 
      crewId, 
      scheduledDate, 
      startTime, 
      endTime, 
      excludeAssignmentId,
      timezone = DEFAULT_TIMEZONE 
    } = params;

    const { primaryDate, secondaryDate, previousDate } = getDatesForCrossMidnightJob(
      scheduledDate, 
      startTime, 
      endTime, 
      timezone
    );

    const primaryRange = getDateRangeForDay(primaryDate, timezone);
    const previousRange = getDateRangeForDay(previousDate, timezone);

    const [primaryAssignments, previousDayAssignments] = await Promise.all([
      storage.getCrewAssignments(companyId, { crewId, startDate: primaryRange.startOfDay, endDate: primaryRange.endOfDay }),
      storage.getCrewAssignments(companyId, { crewId, startDate: previousRange.startOfDay, endDate: previousRange.endOfDay }),
    ]);

    let allAssignments = [...primaryAssignments, ...previousDayAssignments];

    if (secondaryDate) {
      const nextRange = getDateRangeForDay(secondaryDate, timezone);
      const nextDayAssignments = await storage.getCrewAssignments(companyId, {
        crewId,
        startDate: nextRange.startOfDay,
        endDate: nextRange.endOfDay,
      });
      allAssignments = [...allAssignments, ...nextDayAssignments];
    }

    const conflictingAssignments = allAssignments.filter((assignment) => {
      if (excludeAssignmentId && assignment.id === excludeAssignmentId) {
        return false;
      }

      const existingDate = normalizeDateInTimezone(new Date(assignment.scheduledDate), timezone);
      
      return timeRangesOverlapCrossMidnight(
        { startTime, endTime },
        primaryDate,
        { startTime: assignment.startTime, endTime: assignment.endTime },
        existingDate
      );
    });

    if (conflictingAssignments.length > 0) {
      const isCrossMidnight = spansMidnight(startTime, endTime);
      const dateInfo = isCrossMidnight 
        ? `${primaryDate} to ${secondaryDate}` 
        : primaryDate;
      return {
        hasConflict: true,
        conflictType: "crew",
        conflictingAssignments,
        message: `Crew is already assigned during this time slot on ${dateInfo}`,
      };
    }

    return { hasConflict: false };
  }

  async checkEquipmentConflict(params: EquipmentConflictCheckParams): Promise<ConflictResult> {
    const { 
      companyId, 
      equipmentId, 
      scheduledDate, 
      startTime, 
      endTime, 
      excludeReservationId,
      timezone = DEFAULT_TIMEZONE 
    } = params;

    const { primaryDate, secondaryDate, previousDate } = getDatesForCrossMidnightJob(
      scheduledDate, 
      startTime, 
      endTime, 
      timezone
    );

    const primaryRange = getDateRangeForDay(primaryDate, timezone);
    const previousRange = getDateRangeForDay(previousDate, timezone);

    const [primaryReservations, previousDayReservations] = await Promise.all([
      storage.getEquipmentReservations(companyId, { equipmentId, startDate: primaryRange.startOfDay, endDate: primaryRange.endOfDay }),
      storage.getEquipmentReservations(companyId, { equipmentId, startDate: previousRange.startOfDay, endDate: previousRange.endOfDay }),
    ]);

    let allReservations = [...primaryReservations, ...previousDayReservations];

    if (secondaryDate) {
      const nextRange = getDateRangeForDay(secondaryDate, timezone);
      const nextDayReservations = await storage.getEquipmentReservations(companyId, {
        equipmentId,
        startDate: nextRange.startOfDay,
        endDate: nextRange.endOfDay,
      });
      allReservations = [...allReservations, ...nextDayReservations];
    }

    const conflictingReservations = allReservations.filter((reservation) => {
      if (excludeReservationId && reservation.id === excludeReservationId) {
        return false;
      }

      const existingDate = normalizeDateInTimezone(new Date(reservation.scheduledDate), timezone);
      
      return timeRangesOverlapCrossMidnight(
        { startTime, endTime },
        primaryDate,
        { startTime: reservation.startTime, endTime: reservation.endTime },
        existingDate
      );
    });

    if (conflictingReservations.length > 0) {
      const isCrossMidnight = spansMidnight(startTime, endTime);
      const dateInfo = isCrossMidnight 
        ? `${primaryDate} to ${secondaryDate}` 
        : primaryDate;
      return {
        hasConflict: true,
        conflictType: "equipment",
        conflictingReservations,
        message: `Equipment is already reserved during this time slot on ${dateInfo}`,
      };
    }

    return { hasConflict: false };
  }

  async checkCrewAssignmentConflicts(
    companyId: string,
    crewId: string,
    scheduledDate: Date,
    startTime?: string | null,
    endTime?: string | null,
    excludeAssignmentId?: string,
    timezone?: string
  ): Promise<ConflictResult> {
    return this.checkCrewConflict({
      companyId,
      crewId,
      scheduledDate,
      startTime,
      endTime,
      excludeAssignmentId,
      timezone,
    });
  }

  async checkEquipmentReservationConflicts(
    companyId: string,
    equipmentId: string,
    scheduledDate: Date,
    startTime?: string | null,
    endTime?: string | null,
    excludeReservationId?: string,
    timezone?: string
  ): Promise<ConflictResult> {
    return this.checkEquipmentConflict({
      companyId,
      equipmentId,
      scheduledDate,
      startTime,
      endTime,
      excludeReservationId,
      timezone,
    });
  }

  async getCrewAvailability(
    companyId: string,
    crewId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CrewAssignment[]> {
    return storage.getCrewAssignments(companyId, {
      crewId,
      startDate,
      endDate,
    });
  }

  async getEquipmentAvailability(
    companyId: string,
    equipmentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<EquipmentReservation[]> {
    return storage.getEquipmentReservations(companyId, {
      equipmentId,
      startDate,
      endDate,
    });
  }

  async getCompanyTimezone(companyId: string): Promise<string> {
    const company = await storage.getCompany(companyId);
    return company?.timezone || DEFAULT_TIMEZONE;
  }

  async checkCrewConflictWithCompanyTimezone(
    params: Omit<CrewConflictCheckParams, "timezone">
  ): Promise<ConflictResult> {
    const timezone = await this.getCompanyTimezone(params.companyId);
    return this.checkCrewConflict({ ...params, timezone });
  }

  async checkEquipmentConflictWithCompanyTimezone(
    params: Omit<EquipmentConflictCheckParams, "timezone">
  ): Promise<ConflictResult> {
    const timezone = await this.getCompanyTimezone(params.companyId);
    return this.checkEquipmentConflict({ ...params, timezone });
  }
}

export { spansMidnight };

export const conflictDetectionService = new ConflictDetectionService();
