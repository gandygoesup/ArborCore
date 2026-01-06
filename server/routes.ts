import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  requireAuth,
  requireCompany,
  requireRole,
  requireCompanyAccessFromParam,
  getAuthedUser,
} from "./auth/authorize";
import {
  assertEstimateEditable,
  assertEstimateTransition,
  assertInvoiceEditable,
  assertInvoiceTransition,
  assertInvoiceNotPaid,
} from "./domain/transitions";
import { CostCalculationService } from "./services/costCalculation";
import { EstimatePricingService } from "./services/estimatePricing";
import { EstimateEngine } from "./services/estimateEngine";
import { conflictDetectionService } from "./services/conflictDetection";
import { PricingToolService } from "./services/pricingToolService";
import { sendEstimateSMS, sendInvoiceSMS, sendPaymentPlanSMS, isTwilioConfigured } from "./services/smsService";
import { generateContractFromEstimate, getContractMagicLinkUrl } from "./services/contractService";
import { enforceSchedulingGate, enforceCloseOutGate, checkJobCloseOut } from "./services/billingAuthority";
import { z } from "zod";
import {
  costProfileInputSchema,
  insertCustomerSchema,
  insertLeadSchema,
  workItemSchema,
  createJobInputSchema,
  updateJobInputSchema,
  insertCrewSchema,
  insertEquipmentSchema,
  insertCrewAssignmentSchema,
  insertEquipmentReservationSchema,
  serviceRequestCategories,
  insertPaymentPlanSchema,
  insertServiceRequestSchema,
  type PaymentPlanScheduleItem,
} from "@shared/schema";
import crypto from "crypto";

// Derive crew validation schemas from shared insertCrewSchema (single source of truth)
// Note: insertCrewSchema already omits id, createdAt, updatedAt
const createCrewInputSchema = insertCrewSchema.omit({
  companyId: true,
  isActive: true,
});
const updateCrewInputSchema = createCrewInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Derive equipment validation schemas from shared insertEquipmentSchema (single source of truth)
// Note: insertEquipmentSchema already omits id, createdAt, updatedAt
const createEquipmentInputSchema = insertEquipmentSchema.omit({
  companyId: true,
  isActive: true,
  purchaseDate: true,
  lastMaintenanceDate: true,
  nextMaintenanceDate: true,
});
const updateEquipmentInputSchema = createEquipmentInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// Helper to detect if a time range spans midnight (endTime < startTime)
function isValidTimeFormat(time: string | null | undefined): boolean {
  if (!time) return true;
  const parts = time.split(":");
  if (parts.length < 2) return false;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return false;
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validateTimeFormat(data: { startTime?: string | null; endTime?: string | null }): boolean {
  return isValidTimeFormat(data.startTime) && isValidTimeFormat(data.endTime);
}

// Helper to validate that times are either both present or both absent
function validateTimePair(data: { startTime?: string | null; endTime?: string | null }): boolean {
  const hasStart = data.startTime !== undefined && data.startTime !== null && data.startTime !== "";
  const hasEnd = data.endTime !== undefined && data.endTime !== null && data.endTime !== "";
  return (hasStart && hasEnd) || (!hasStart && !hasEnd);
}

// Base crew assignment schema (before refinements) for conflict checks
const baseCrewAssignmentInputSchema = insertCrewAssignmentSchema
  .omit({ companyId: true, createdBy: true, isOverridden: true, overrideReason: true })
  .extend({
    scheduledDate: z.coerce.date({ required_error: "Scheduled date is required" }),
    overrideReason: z.string().min(1, "Override reason cannot be empty").optional(),
  });

// Crew assignment input schemas derived from shared schema with date coercion for JSON
// Cross-midnight scheduling is supported (endTime < startTime indicates overnight work)
const createCrewAssignmentInputSchema = baseCrewAssignmentInputSchema
  .refine(validateTimePair, {
    message: "Times must be both provided or both omitted",
    path: ["startTime"],
  })
  .refine(validateTimeFormat, {
    message: "Invalid time format. Use HH:MM format (e.g., 08:00, 22:30)",
    path: ["startTime"],
  });

// Conflict check schema for crew assignments
const conflictCheckCrewAssignmentSchema = baseCrewAssignmentInputSchema.extend({
  excludeAssignmentId: z.string().optional(),
});
const updateCrewAssignmentInputSchema = insertCrewAssignmentSchema
  .omit({ companyId: true, createdBy: true })
  .extend({
    scheduledDate: z.coerce.date().optional(),
    jobId: z.string().optional(),
    crewId: z.string().optional(),
  })
  .partial()
  .refine(validateTimePair, {
    message: "Times must be both provided or both omitted",
    path: ["startTime"],
  })
  .refine(validateTimeFormat, {
    message: "Invalid time format. Use HH:MM format (e.g., 08:00, 22:30)",
    path: ["startTime"],
  });

// Base equipment reservation schema (before refinements) for conflict checks
const baseEquipmentReservationInputSchema = insertEquipmentReservationSchema
  .omit({ companyId: true, createdBy: true, isOverridden: true, overrideReason: true })
  .extend({
    scheduledDate: z.coerce.date({ required_error: "Scheduled date is required" }),
    overrideReason: z.string().min(1, "Override reason cannot be empty").optional(),
  });

// Equipment reservation input schemas derived from shared schema with date coercion for JSON
// Cross-midnight scheduling is supported (endTime < startTime indicates overnight work)
const createEquipmentReservationInputSchema = baseEquipmentReservationInputSchema
  .refine(validateTimePair, {
    message: "Times must be both provided or both omitted",
    path: ["startTime"],
  })
  .refine(validateTimeFormat, {
    message: "Invalid time format. Use HH:MM format (e.g., 08:00, 22:30)",
    path: ["startTime"],
  });

// Conflict check schema for equipment reservations
const conflictCheckEquipmentReservationSchema = baseEquipmentReservationInputSchema.extend({
  excludeReservationId: z.string().optional(),
});

const updateEquipmentReservationInputSchema = insertEquipmentReservationSchema
  .omit({ companyId: true, createdBy: true })
  .extend({
    scheduledDate: z.coerce.date().optional(),
    jobId: z.string().optional(),
    equipmentId: z.string().optional(),
  })
  .partial()
  .refine(validateTimePair, {
    message: "Times must be both provided or both omitted",
    path: ["startTime"],
  })
  .refine(validateTimeFormat, {
    message: "Invalid time format. Use HH:MM format (e.g., 08:00, 22:30)",
    path: ["startTime"],
  });

// Helper to coerce optional date strings, treating empty strings as undefined
const optionalDateString = z.preprocess(
  (val) => (val === "" || val === undefined || val === null ? undefined : val),
  z.coerce.date().optional()
);

// Query filter schema for date-based scheduling queries with empty string handling
const schedulingQueryFiltersSchema = z.object({
  jobId: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
  crewId: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
  equipmentId: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
  date: optionalDateString,
  startDate: optionalDateString,
  endDate: optionalDateString,
});

// Schema for validating payment plan milestone structure
const milestoneSchema = z.object({
  name: z.string().min(1, "Milestone name is required"),
  type: z.enum(["percent", "flat"], { message: "Type must be 'percent' or 'flat'" }),
  value: z.number().positive("Value must be positive"),
  invoiceType: z.enum(["deposit", "milestone", "final"], { message: "Invalid invoice type" }),
}).refine(
  (data) => {
    // For percent type, value must be <= 100
    if (data.type === "percent") {
      return data.value <= 100;
    }
    return true;
  },
  { message: "Percent value must be between 0 and 100", path: ["value"] }
);

const paymentPlanTemplateInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  milestones: z.array(milestoneSchema).min(1, "At least one milestone is required"),
  isDefault: z.boolean().optional(),
}).refine(
  (data) => {
    // Ensure milestone names are unique
    const names = data.milestones.map((m) => m.name.toLowerCase().trim());
    return new Set(names).size === names.length;
  },
  { message: "Milestone names must be unique", path: ["milestones"] }
).refine(
  (data) => {
    // If all milestones are percent type, they should sum to <= 100
    const percentMilestones = data.milestones.filter((m) => m.type === "percent");
    if (percentMilestones.length === data.milestones.length) {
      const totalPercent = percentMilestones.reduce((sum, m) => sum + m.value, 0);
      return totalPercent <= 100;
    }
    return true;
  },
  { message: "Total percentage across all milestones cannot exceed 100%", path: ["milestones"] }
);
import type { WorkItem } from "@shared/schema";
import {
  PORTAL_TOKEN_ERROR_RESPONSE,
  PORTAL_TOKEN_ERROR_STATUS,
} from "./constants/portal";

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  // ============================================================================
  // AUTH ROUTES
  // ============================================================================
  app.get("/api/auth/user", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let company = null;
      let roles: any[] = [];
      if (user.companyId) {
        company = await storage.getCompany(user.companyId);
        roles = await storage.getUserRoles(userId);
      }

      res.json({ ...user, company, roles });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ============================================================================
  // COMPANY ROUTES
  // ============================================================================
  app.post("/api/companies", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { name, timezone, operatingMode } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Company name is required" });
      }

      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const existingCompany = await storage.getCompanyBySlug(slug);
      if (existingCompany) {
        return res
          .status(400)
          .json({ message: "A company with this name already exists" });
      }

      const company = await storage.createCompany({
        name,
        slug,
        timezone: timezone || "America/New_York",
        operatingMode: operatingMode || "small_team",
      });

      await storage.updateUserCompany(userId, company.id);
      const defaultRoles = await storage.createDefaultRoles(company.id);
      const adminRole = defaultRoles.find((r) => r.name === "Admin");
      if (adminRole) {
        await storage.assignUserRole(userId, adminRole.id);
      }

      await storage.upsertCompanySettings({ companyId: company.id });

      await storage.createAuditLogEntry({
        companyId: company.id,
        userId,
        action: "company.created",
        entityType: "company",
        entityId: company.id,
        newState: company,
      });

      res.json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Failed to create company" });
    }
  });

  app.get(
    "/api/companies/:id",
    requireAuth,
    requireCompanyAccessFromParam("id"),
    async (req: any, res: Response) => {
      try {
        const company = await storage.getCompany(req.params.id);
        if (!company) {
          return res.status(404).json({ message: "Company not found" });
        }

        res.json(company);
      } catch (error) {
        console.error("Error fetching company:", error);
        res.status(500).json({ message: "Failed to fetch company" });
      }
    },
  );

  app.patch(
    "/api/companies/:id",
    requireAuth,
    requireCompanyAccessFromParam("id"),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId } = getAuthedUser(req);
        const previousCompany = await storage.getCompany(req.params.id);
        const company = await storage.updateCompany(req.params.id, req.body);

        await storage.createAuditLogEntry({
          companyId: req.params.id,
          userId,
          action: "company.updated",
          entityType: "company",
          entityId: req.params.id,
          previousState: previousCompany,
          newState: company,
        });

        res.json(company);
      } catch (error) {
        console.error("Error updating company:", error);
        res.status(500).json({ message: "Failed to update company" });
      }
    },
  );

  // ============================================================================
  // SMS/TWILIO STATUS
  // ============================================================================
  app.get(
    "/api/sms/status",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      res.json({ 
        configured: isTwilioConfigured(),
        available: isTwilioConfigured() 
      });
    },
  );

  // ============================================================================
  // USER MANAGEMENT ROUTES (Admin only)
  // ============================================================================
  app.get(
    "/api/users",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const companyUsers = await storage.getCompanyUsers(companyId!);
        res.json(companyUsers);
      } catch (error) {
        console.error("Error fetching company users:", error);
        res.status(500).json({ message: "Failed to fetch users" });
      }
    },
  );

  app.get(
    "/api/roles",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const companyRoles = await storage.getRoles(companyId!);
        res.json(companyRoles);
      } catch (error) {
        console.error("Error fetching roles:", error);
        res.status(500).json({ message: "Failed to fetch roles" });
      }
    },
  );

  app.post(
    "/api/roles",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { name, description } = req.body;

        if (!name || typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ message: "Role name is required" });
        }

        const role = await storage.createRole({
          companyId: companyId!,
          name: name.trim(),
          description: description || null,
          isDefault: false,
          isSystemRole: false,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "role.created",
          entityType: "role",
          entityId: role.id,
          newState: role,
        });

        res.status(201).json(role);
      } catch (error) {
        console.error("Error creating role:", error);
        res.status(500).json({ message: "Failed to create role" });
      }
    },
  );

  app.put(
    "/api/roles/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { id } = req.params;
        const { name, description } = req.body;

        const existingRole = await storage.getRole(id);
        if (!existingRole || existingRole.companyId !== companyId) {
          return res.status(404).json({ message: "Role not found" });
        }

        if (existingRole.isSystemRole) {
          return res.status(403).json({ message: "Cannot modify system roles" });
        }

        const role = await storage.updateRole(companyId!, id, {
          name: name?.trim() || existingRole.name,
          description: description !== undefined ? description : existingRole.description,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "role.updated",
          entityType: "role",
          entityId: id,
          previousState: existingRole,
          newState: role,
        });

        res.json(role);
      } catch (error) {
        console.error("Error updating role:", error);
        res.status(500).json({ message: "Failed to update role" });
      }
    },
  );

  app.delete(
    "/api/roles/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { id } = req.params;

        const existingRole = await storage.getRole(id);
        if (!existingRole || existingRole.companyId !== companyId) {
          return res.status(404).json({ message: "Role not found" });
        }

        if (existingRole.isSystemRole) {
          return res.status(403).json({ message: "Cannot delete system roles" });
        }

        const deleted = await storage.deleteRole(companyId!, id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete role" });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "role.deleted",
          entityType: "role",
          entityId: id,
          previousState: existingRole,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting role:", error);
        res.status(500).json({ message: "Failed to delete role" });
      }
    },
  );

  app.get(
    "/api/permissions",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const allPermissions = await storage.getPermissions();
        res.json(allPermissions);
      } catch (error) {
        console.error("Error fetching permissions:", error);
        res.status(500).json({ message: "Failed to fetch permissions" });
      }
    },
  );

  app.get(
    "/api/roles/:id/permissions",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const { id } = req.params;

        const role = await storage.getRole(id);
        if (!role || role.companyId !== companyId) {
          return res.status(404).json({ message: "Role not found" });
        }

        const rolePerms = await storage.getRolePermissions(id);
        res.json(rolePerms);
      } catch (error) {
        console.error("Error fetching role permissions:", error);
        res.status(500).json({ message: "Failed to fetch role permissions" });
      }
    },
  );

  app.put(
    "/api/roles/:id/permissions",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { id } = req.params;
        const { permissionIds } = req.body;

        if (!Array.isArray(permissionIds)) {
          return res.status(400).json({ message: "permissionIds must be an array" });
        }

        const role = await storage.getRole(id);
        if (!role || role.companyId !== companyId) {
          return res.status(404).json({ message: "Role not found" });
        }

        const previousPerms = await storage.getRolePermissions(id);
        await storage.setRolePermissions(id, permissionIds);
        const newPerms = await storage.getRolePermissions(id);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "role.permissions.updated",
          entityType: "role",
          entityId: id,
          previousState: { permissions: previousPerms.map((p) => p.id) },
          newState: { permissions: newPerms.map((p) => p.id) },
        });

        res.json(newPerms);
      } catch (error) {
        console.error("Error updating role permissions:", error);
        res.status(500).json({ message: "Failed to update role permissions" });
      }
    },
  );

  app.delete(
    "/api/users/:userId/roles/:roleId",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: adminId, companyId } = getAuthedUser(req);
        const { userId: targetUserId, roleId } = req.params;

        const role = await storage.getRole(roleId);
        if (!role || role.companyId !== companyId) {
          return res.status(404).json({ message: "Role not found" });
        }

        await storage.removeUserRole(targetUserId, roleId);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId: adminId,
          action: "user.role.removed",
          entityType: "user",
          entityId: targetUserId,
          previousState: { roleId, roleName: role.name },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing user role:", error);
        res.status(500).json({ message: "Failed to remove user role" });
      }
    },
  );

  app.post(
    "/api/users/invite",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: adminId, companyId } = getAuthedUser(req);
        const { email, roleId } = req.body;

        if (!email || !roleId) {
          return res.status(400).json({ message: "Email and role are required" });
        }

        const role = await storage.getRole(roleId);
        if (!role || role.companyId !== companyId) {
          return res.status(400).json({ message: "Invalid role" });
        }

        const user = await storage.getUserByEmail(email);
        
        if (!user) {
          return res.status(404).json({ 
            message: "User not found. They must log in to ArborCore at least once before they can be invited to your team."
          });
        }

        if (user.companyId && user.companyId !== companyId) {
          return res.status(409).json({ message: "This user already belongs to another company" });
        }
        
        if (!user.companyId) {
          await storage.updateUserCompany(user.id, companyId!);
        }

        await storage.assignUserRole(user.id, roleId, adminId);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId: adminId,
          action: "user.invited",
          entityType: "user",
          entityId: user.id,
          newState: { email, roleId, roleName: role.name },
        });

        // Fetch full roles list for the user
        const userRoles = await storage.getUserRoles(user.id);

        const userWithRoles = {
          ...user,
          companyId: companyId!,
          roles: userRoles,
        };

        res.json(userWithRoles);
      } catch (error) {
        console.error("Error inviting user:", error);
        res.status(500).json({ message: "Failed to invite user" });
      }
    },
  );

  // ============================================================================
  // COMPANY SETTINGS ROUTES
  // ============================================================================
  app.get(
    "/api/company-settings",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const settings = await storage.getCompanySettings(companyId!);
        res.json(settings || null);
      } catch (error) {
        console.error("Error fetching company settings:", error);
        res.status(500).json({ message: "Failed to fetch company settings" });
      }
    },
  );

  app.put(
    "/api/company-settings",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const settings = await storage.upsertCompanySettings({
          ...req.body,
          companyId: companyId!,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "company_settings.updated",
          entityType: "company_settings",
          entityId: settings.id,
          newState: settings,
        });

        res.json(settings);
      } catch (error) {
        console.error("Error updating company settings:", error);
        res.status(500).json({ message: "Failed to update company settings" });
      }
    },
  );

  // ============================================================================
  // COST PROFILE SNAPSHOT ROUTES
  // ============================================================================
  app.get(
    "/api/cost-profiles",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const snapshots = await storage.getCostProfileSnapshots(companyId!);
        res.json(snapshots);
      } catch (error) {
        console.error("Error fetching cost profiles:", error);
        res.status(500).json({ message: "Failed to fetch cost profiles" });
      }
    },
  );

  app.get(
    "/api/cost-profiles/latest",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const snapshot = await storage.getLatestCostProfileSnapshot(companyId!);
        res.json(snapshot || null);
      } catch (error) {
        console.error("Error fetching latest cost profile:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch latest cost profile" });
      }
    },
  );

  app.post(
    "/api/cost-profiles",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const parseResult = costProfileInputSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid cost profile data",
            errors: parseResult.error.errors,
          });
        }

        const inputData = parseResult.data;
        const calculatedOutputs = CostCalculationService.calculate(inputData);

        const latestSnapshot = await storage.getLatestCostProfileSnapshot(
          companyId!,
        );
        const newVersion = latestSnapshot ? latestSnapshot.version + 1 : 1;

        const snapshot = await storage.createCostProfileSnapshot({
          companyId: companyId!,
          version: newVersion,
          snapshotData: inputData,
          calculatedOutputs,
          createdBy: userId,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "cost_profile.created",
          entityType: "cost_profile_snapshot",
          entityId: snapshot.id,
          newState: { version: newVersion, calculatedOutputs },
        });

        res.json(snapshot);
      } catch (error) {
        console.error("Error creating cost profile:", error);
        res.status(500).json({ message: "Failed to create cost profile" });
      }
    },
  );

  app.post(
    "/api/cost-profiles/calculate",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const parseResult = costProfileInputSchema.safeParse(req.body);
        if (!parseResult.success) {
          return res.status(400).json({
            message: "Invalid cost profile data",
            errors: parseResult.error.errors,
          });
        }

        const calculatedOutputs = CostCalculationService.calculate(
          parseResult.data,
        );
        res.json(calculatedOutputs);
      } catch (error) {
        console.error("Error calculating cost profile:", error);
        res.status(500).json({ message: "Failed to calculate cost profile" });
      }
    },
  );

  // ============================================================================
  // CUSTOMER ROUTES
  // ============================================================================
  app.get(
    "/api/customers",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const customersList = await storage.getCustomers(companyId!);
        res.json(customersList);
      } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ message: "Failed to fetch customers" });
      }
    },
  );

  app.post(
    "/api/customers",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const customer = await storage.createCustomer({
          ...req.body,
          companyId: companyId!,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "customer.created",
          entityType: "customer",
          entityId: customer.id,
          newState: customer,
        });

        res.json(customer);
      } catch (error) {
        console.error("Error creating customer:", error);
        res.status(500).json({ message: "Failed to create customer" });
      }
    },
  );

  app.delete(
    "/api/customers/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingCustomer = await storage.getCustomer(companyId!, req.params.id);
        if (!existingCustomer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        const deleted = await storage.deleteCustomer(companyId!, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete customer" });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "customer.deleted",
          entityType: "customer",
          entityId: req.params.id,
          previousState: existingCustomer,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ message: "Failed to delete customer" });
      }
    },
  );

  // ============================================================================
  // PROPERTY ROUTES
  // ============================================================================
  app.get(
    "/api/customers/:customerId/properties",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const propertiesList = await storage.getProperties(
          companyId!,
          req.params.customerId,
        );
        res.json(propertiesList);
      } catch (error) {
        console.error("Error fetching properties:", error);
        res.status(500).json({ message: "Failed to fetch properties" });
      }
    },
  );

  app.delete(
    "/api/properties/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingProperty = await storage.getProperty(companyId!, req.params.id);
        if (!existingProperty) {
          return res.status(404).json({ message: "Property not found" });
        }

        const deleted = await storage.deleteProperty(companyId!, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete property" });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "property.deleted",
          entityType: "property",
          entityId: req.params.id,
          previousState: existingProperty,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting property:", error);
        res.status(500).json({ message: "Failed to delete property" });
      }
    },
  );

  // ============================================================================
  // LEAD ROUTES
  // ============================================================================
  app.get(
    "/api/leads",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const leadsList = await storage.getLeads(companyId!);
        res.json(leadsList);
      } catch (error) {
        console.error("Error fetching leads:", error);
        res.status(500).json({ message: "Failed to fetch leads" });
      }
    },
  );

  app.post(
    "/api/leads",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const lead = await storage.createLead({
          ...req.body,
          companyId: companyId!,
          assignedTo: req.body.assignedTo || userId,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "lead.created",
          entityType: "lead",
          entityId: lead.id,
          newState: lead,
        });

        res.json(lead);
      } catch (error) {
        console.error("Error creating lead:", error);
        res.status(500).json({ message: "Failed to create lead" });
      }
    },
  );

  app.patch(
    "/api/leads/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingLead = await storage.getLead(companyId!, req.params.id);
        if (!existingLead) {
          return res.status(404).json({ message: "Lead not found" });
        }

        const lead = await storage.updateLead(
          companyId!,
          req.params.id,
          req.body,
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "lead.updated",
          entityType: "lead",
          entityId: req.params.id,
          previousState: existingLead,
          newState: lead,
        });

        res.json(lead);
      } catch (error) {
        console.error("Error updating lead:", error);
        res.status(500).json({ message: "Failed to update lead" });
      }
    },
  );

  app.delete(
    "/api/leads/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingLead = await storage.getLead(companyId!, req.params.id);
        if (!existingLead) {
          return res.status(404).json({ message: "Lead not found" });
        }

        const deleted = await storage.deleteLead(companyId!, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete lead" });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "lead.deleted",
          entityType: "lead",
          entityId: req.params.id,
          previousState: existingLead,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting lead:", error);
        res.status(500).json({ message: "Failed to delete lead" });
      }
    },
  );

  // ============================================================================
  // ESTIMATE ROUTES
  // ============================================================================
  app.get(
    "/api/estimates",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        const estimatesList = await storage.getEstimates(companyId!);

        const enrichedEstimates = await Promise.all(
          estimatesList.map(async (estimate) => {
            const [customer, property, latestSnapshot] = await Promise.all([
              storage.getCustomer(companyId!, estimate.customerId),
              estimate.propertyId
                ? storage.getProperty(companyId!, estimate.propertyId)
                : Promise.resolve(null),
              storage.getLatestEstimateSnapshot(companyId!, estimate.id),
            ]);

            return {
              ...estimate,
              customer: customer || null,
              property: property || null,
              latestTotal: latestSnapshot?.total || null,
            };
          }),
        );

        res.json(enrichedEstimates);
      } catch (error) {
        console.error("Error fetching estimates:", error);
        res.status(500).json({ message: "Failed to fetch estimates" });
      }
    },
  );

  app.get(
    "/api/estimates/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        const result = await storage.getEstimateWithLatestSnapshot(
          companyId!,
          req.params.id,
        );
        if (!result) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching estimate:", error);
        res.status(500).json({ message: "Failed to fetch estimate" });
      }
    },
  );

  app.post(
    "/api/estimates",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const {
          customerId,
          propertyId,
          leadId,
          jobAddress,
          title,
          description,
          workItems,
          pricingProfileId,
          inputs,
        } = req.body;

        if (!customerId) {
          return res.status(400).json({ message: "Customer ID is required" });
        }

        const customer = await storage.getCustomer(companyId!, customerId);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        const { estimateId, previewResult } = await EstimateEngine.createWithEngine(
          companyId!,
          userId,
          {
            customerId,
            propertyId: propertyId || undefined,
            leadId: leadId || undefined,
            title: title || undefined,
            description: description || undefined,
            jobAddress: jobAddress || undefined,
          },
          {
            pricingProfileId: pricingProfileId || undefined,
            inputs: inputs || {},
            workItems: workItems || [],
          }
        );

        const estimate = await storage.getEstimateById(companyId!, estimateId);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.created",
          entityType: "estimate",
          entityId: estimateId,
          newState: estimate,
        });

        res.json({
          ...estimate,
          pricingPreview: previewResult.pricingSnapshot,
        });
      } catch (error) {
        console.error("Error creating estimate:", error);
        res.status(500).json({ message: "Failed to create estimate" });
      }
    },
  );

  app.patch(
    "/api/estimates/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId, roles } = getAuthedUser(req);

        const existingEstimate = await storage.getEstimate(
          companyId!,
          req.params.id,
        );
        if (!existingEstimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        try {
          assertEstimateEditable(existingEstimate.status, roles);
        } catch (err: any) {
          return res.status(err.status || 400).json({ message: err.message });
        }

        const { title, description, jobAddress, workItems, validUntil, pricingProfileId, inputs } = req.body;

        const updatedWorkItems = workItems !== undefined ? workItems : (existingEstimate.workItems || []);
        const updatedInputs = inputs !== undefined ? inputs : ((existingEstimate.inputSnapshot as Record<string, any>) || {});
        const updatedProfileId = pricingProfileId !== undefined ? pricingProfileId : existingEstimate.pricingProfileId;

        const preview = await EstimateEngine.preview({
          companyId: companyId!,
          mode: 'internal',
          pricingProfileId: updatedProfileId || undefined,
          inputs: updatedInputs,
          workItems: updatedWorkItems,
        });

        const estimate = await storage.updateEstimate(
          companyId!,
          req.params.id,
          {
            title,
            description,
            jobAddress,
            workItems: updatedWorkItems,
            validUntil,
            pricingProfileId: preview.pricingProfile?.id || null,
            inputSnapshot: preview.inputSnapshot,
            pricingSnapshot: preview.pricingSnapshot,
          },
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.updated",
          entityType: "estimate",
          entityId: req.params.id,
          previousState: existingEstimate,
          newState: estimate,
        });

        res.json({
          ...estimate,
          pricingPreview: preview.pricingSnapshot,
        });
      } catch (error) {
        console.error("Error updating estimate:", error);
        res.status(500).json({ message: "Failed to update estimate" });
      }
    },
  );

  app.delete(
    "/api/estimates/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingEstimate = await storage.getEstimate(
          companyId!,
          req.params.id,
        );
        if (!existingEstimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        if (existingEstimate.status !== "draft") {
          return res.status(409).json({
            message: `Cannot delete estimate with status "${existingEstimate.status}". Only draft estimates can be deleted.`,
          });
        }

        const deleted = await storage.deleteEstimate(companyId!, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete estimate" });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.deleted",
          entityType: "estimate",
          entityId: req.params.id,
          previousState: {
            id: existingEstimate.id,
            estimateNumber: existingEstimate.estimateNumber,
            status: existingEstimate.status,
            customerId: existingEstimate.customerId,
          },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting estimate:", error);
        res.status(500).json({ message: "Failed to delete estimate" });
      }
    },
  );

  // Pricing Tool Preview Endpoint (ephemeral - no persistence, no audit logging)
  app.post(
    "/api/estimates/pricing/preview",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        // Validate input
        const validation = PricingToolService.validateInput(req.body);
        if (!validation.valid) {
          return res.status(400).json({
            message: "Invalid pricing tool input",
            errors: validation.errors,
          });
        }

        // Get cost profile
        const costProfile = await storage.getLatestCostProfileSnapshot(companyId!);
        if (!costProfile) {
          return res.status(400).json({
            message: "No cost profile configured. Please set up cost profile first.",
          });
        }

        // Get company for tax rate
        const company = await storage.getCompany(companyId!);
        const taxRate = company?.defaultTaxRate
          ? parseFloat(company.defaultTaxRate)
          : 0;

        // Calculate preview (ephemeral - no persistence)
        const previewResult = PricingToolService.calculatePreview(
          req.body,
          costProfile,
          taxRate
        );

        res.json(previewResult);
      } catch (error) {
        console.error("Error calculating pricing preview:", error);
        res.status(500).json({ message: "Failed to calculate pricing preview" });
      }
    },
  );

  app.post(
    "/api/estimates/:id/calculate",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        const estimate = await storage.getEstimate(companyId!, req.params.id);
        if (!estimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        const costProfile = await storage.getLatestCostProfileSnapshot(
          companyId!,
        );
        if (!costProfile) {
          return res
            .status(400)
            .json({
              message:
                "No cost profile configured. Please set up cost profile first.",
            });
        }

        const company = await storage.getCompany(companyId!);
        const taxRate = company?.defaultTaxRate
          ? parseFloat(company.defaultTaxRate)
          : 0;

        const { overrideMultiplier, overrideReason } = req.body;

        if (overrideMultiplier !== undefined && !overrideReason) {
          return res
            .status(400)
            .json({
              message:
                "Override reason is required when using override multiplier",
            });
        }

        const workItems = estimate.workItems as WorkItem[];
        const pricingResult = EstimatePricingService.calculate({
          workItems,
          costProfileSnapshot: costProfile,
          taxRate,
          overrideMultiplier,
          overrideReason,
        });

        res.json(pricingResult);
      } catch (error) {
        console.error("Error calculating estimate:", error);
        res.status(500).json({ message: "Failed to calculate estimate" });
      }
    },
  );

  app.post(
    "/api/estimates/:id/send",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId, roles } = getAuthedUser(req);

        const estimate = await storage.getEstimate(companyId!, req.params.id);
        if (!estimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        try {
          assertEstimateTransition(estimate.status, "sent");
        } catch (err: any) {
          return res.status(err.status || 400).json({ message: err.message });
        }

        const costProfile = await storage.getLatestCostProfileSnapshot(
          companyId!,
        );
        if (!costProfile) {
          return res
            .status(400)
            .json({ message: "No cost profile configured" });
        }

        const company = await storage.getCompany(companyId!);
        const taxRate = company?.defaultTaxRate
          ? parseFloat(company.defaultTaxRate)
          : 0;

        const { overrideMultiplier, overrideReason, deliveryMethod } = req.body;
        const sendSms = deliveryMethod === 'sms' || deliveryMethod === 'both';

        if (overrideMultiplier !== undefined && !overrideReason) {
          return res
            .status(400)
            .json({
              message:
                "Override reason is required when using override multiplier",
            });
        }

        const workItems = estimate.workItems as WorkItem[];
        const pricingResult = EstimatePricingService.calculate({
          workItems,
          costProfileSnapshot: costProfile,
          taxRate,
          overrideMultiplier,
          overrideReason,
        });

        const magicLinkToken = crypto.randomBytes(32).toString("hex");
        const magicLinkTokenHash = crypto
          .createHash("sha256")
          .update(magicLinkToken)
          .digest("hex");
        const magicLinkExpiresAt = new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000,
        );

        const snapshotVersion = await storage.getNextSnapshotVersion(
          companyId!,
          estimate.id,
        );

        await storage.createEstimateSnapshot({
          estimateId: estimate.id,
          snapshotVersion,
          triggerAction: "send",
          costProfileSnapshotId: costProfile.id,
          workItemsSnapshot: workItems,
          pricingBreakdown: pricingResult.breakdown,
          subtotal: pricingResult.subtotal.toString(),
          taxRate: pricingResult.taxRate.toString(),
          taxAmount: pricingResult.taxAmount.toString(),
          total: pricingResult.total.toString(),
          marginPercentage: pricingResult.marginPercentage.toString(),
          isOverride: pricingResult.isOverride,
          overrideReason: pricingResult.overrideReason,
          overrideMultiplier: pricingResult.overrideMultiplier?.toString(),
          floorViolation: pricingResult.floorViolation,
          previousStatus: estimate.status,
          newStatus: "sent",
          actorId: userId,
          actorType: "user",
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });

        const updatedEstimate = await storage.updateEstimate(
          companyId!,
          estimate.id,
          {
            status: "sent",
            sentAt: new Date(),
            magicLinkTokenHash,
            magicLinkExpiresAt,
          },
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.sent",
          entityType: "estimate",
          entityId: estimate.id,
          previousState: { status: estimate.status },
          newState: { status: "sent", snapshotVersion },
          isOverride: pricingResult.isOverride,
          reason: overrideReason,
        });

        let smsResult = null;
        if (sendSms) {
          const customer = await storage.getCustomer(companyId!, estimate.customerId);
          if (customer?.phone) {
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : process.env.BASE_URL || 'http://localhost:5000';
            const magicLinkUrl = `${baseUrl}/e/${magicLinkToken}`;
            
            smsResult = await sendEstimateSMS({
              to: customer.phone,
              customerName: `${customer.firstName} ${customer.lastName}`.trim(),
              companyName: company?.name || 'Your Tree Service',
              estimateTotal: pricingResult.total.toFixed(2),
              magicLinkUrl,
            });

            if (!smsResult.success) {
              console.error('SMS delivery failed:', smsResult.error);
            }
          } else {
            smsResult = { success: false, error: 'Customer has no phone number' };
          }
        }

        res.json({
          estimate: updatedEstimate,
          magicLinkToken,
          pricing: pricingResult,
          smsDelivery: sendSms ? smsResult : undefined,
        });
      } catch (error) {
        console.error("Error sending estimate:", error);
        res.status(500).json({ message: "Failed to send estimate" });
      }
    },
  );

  // ============================================================================
  // CHANGE ORDER - Create new estimate version from approved/sent parent
  // ============================================================================
  app.post(
    "/api/estimates/:id/change-order",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const parentEstimate = await storage.getEstimate(
          companyId!,
          req.params.id,
        );
        if (!parentEstimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        if (
          parentEstimate.status !== "approved" &&
          parentEstimate.status !== "sent"
        ) {
          return res.status(409).json({
            message:
              "Change orders can only be created from approved or sent estimates",
          });
        }

        const costProfile = await storage.getLatestCostProfileSnapshot(
          companyId!,
        );
        if (!costProfile) {
          return res
            .status(400)
            .json({ message: "No cost profile configured" });
        }

        const company = await storage.getCompany(companyId!);
        const taxRate = company?.defaultTaxRate
          ? parseFloat(company.defaultTaxRate)
          : 0;

        const parentSnapshot = await storage.getLatestEstimateSnapshot(
          companyId!,
          parentEstimate.id,
        );
        const workItems = (parentSnapshot?.workItemsSnapshot ||
          parentEstimate.workItems) as WorkItem[];

        const {
          modifiedWorkItems,
          title,
          description,
          overrideMultiplier,
          overrideReason,
        } = req.body;

        if (overrideMultiplier !== undefined && !overrideReason) {
          return res
            .status(400)
            .json({
              message:
                "Override reason is required when using override multiplier",
            });
        }

        const newWorkItems = modifiedWorkItems || workItems;
        const pricingResult = EstimatePricingService.calculate({
          workItems: newWorkItems,
          costProfileSnapshot: costProfile,
          taxRate,
          overrideMultiplier,
          overrideReason,
        });

        const newEstimateNumber = await storage.generateEstimateNumber(
          companyId!,
        );
        const newVersion = (parentEstimate.version || 1) + 1;

        const magicLinkToken = crypto.randomBytes(32).toString("hex");
        const magicLinkTokenHash = crypto
          .createHash("sha256")
          .update(magicLinkToken)
          .digest("hex");
        const magicLinkExpiresAt = new Date(
          Date.now() + 14 * 24 * 60 * 60 * 1000,
        );

        const newEstimate = await storage.createEstimate({
          companyId: companyId!,
          customerId: parentEstimate.customerId,
          propertyId: parentEstimate.propertyId,
          leadId: parentEstimate.leadId,
          estimateNumber: newEstimateNumber,
          status: "sent",
          title: title || parentEstimate.title,
          description: description || parentEstimate.description,
          workItems: newWorkItems,
          validUntil: parentEstimate.validUntil,
          sentAt: new Date(),
          parentEstimateId: parentEstimate.id,
          version: newVersion,
          magicLinkTokenHash,
          magicLinkExpiresAt,
          createdBy: userId,
        });

        await storage.createEstimateSnapshot({
          estimateId: newEstimate.id,
          snapshotVersion: 1,
          triggerAction: "change_order",
          costProfileSnapshotId: costProfile.id,
          workItemsSnapshot: newWorkItems,
          pricingBreakdown: pricingResult.breakdown,
          subtotal: pricingResult.subtotal.toString(),
          taxRate: pricingResult.taxRate.toString(),
          taxAmount: pricingResult.taxAmount.toString(),
          total: pricingResult.total.toString(),
          marginPercentage: pricingResult.marginPercentage.toString(),
          isOverride: pricingResult.isOverride,
          overrideReason: pricingResult.overrideReason,
          overrideMultiplier: pricingResult.overrideMultiplier?.toString(),
          floorViolation: pricingResult.floorViolation,
          previousStatus: null,
          newStatus: "sent",
          actorId: userId,
          actorType: "user",
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });

        const previousParentStatus = parentEstimate.status;
        await storage.updateEstimate(companyId!, parentEstimate.id, {
          status: "superseded",
        });

        const parentSnapshotVersion = await storage.getNextSnapshotVersion(
          companyId!,
          parentEstimate.id,
        );
        await storage.createEstimateSnapshot({
          estimateId: parentEstimate.id,
          snapshotVersion: parentSnapshotVersion,
          triggerAction: "supersede",
          costProfileSnapshotId:
            parentSnapshot?.costProfileSnapshotId || costProfile.id,
          workItemsSnapshot: parentSnapshot?.workItemsSnapshot || [],
          pricingBreakdown: parentSnapshot?.pricingBreakdown || {},
          subtotal: parentSnapshot?.subtotal || "0",
          taxRate: parentSnapshot?.taxRate || "0",
          taxAmount: parentSnapshot?.taxAmount || "0",
          total: parentSnapshot?.total || "0",
          marginPercentage: parentSnapshot?.marginPercentage || "0",
          isOverride: parentSnapshot?.isOverride || false,
          overrideReason: parentSnapshot?.overrideReason,
          overrideMultiplier: parentSnapshot?.overrideMultiplier,
          floorViolation: parentSnapshot?.floorViolation || false,
          previousStatus: previousParentStatus,
          newStatus: "superseded",
          actorId: userId,
          actorType: "user",
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.change_order.created",
          entityType: "estimate",
          entityId: newEstimate.id,
          previousState: {
            parentEstimateId: parentEstimate.id,
            parentStatus: previousParentStatus,
          },
          newState: {
            status: "sent",
            version: newVersion,
            parentEstimateId: parentEstimate.id,
          },
          isOverride: pricingResult.isOverride,
          reason: overrideReason,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.superseded",
          entityType: "estimate",
          entityId: parentEstimate.id,
          previousState: { status: previousParentStatus },
          newState: {
            status: "superseded",
            supersededByEstimateId: newEstimate.id,
          },
        });

        res.json({
          changeOrder: newEstimate,
          parentEstimate: { ...parentEstimate, status: "superseded" },
          magicLinkToken,
          pricing: pricingResult,
        });
      } catch (error) {
        console.error("Error creating change order:", error);
        res.status(500).json({ message: "Failed to create change order" });
      }
    },
  );

  app.delete(
    "/api/estimates/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId, roles } = getAuthedUser(req);

        const estimate = await storage.getEstimate(companyId!, req.params.id);
        if (!estimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        try {
          assertEstimateEditable(estimate.status, roles);
        } catch (err: any) {
          return res.status(err.status || 400).json({ message: err.message });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.deleted",
          entityType: "estimate",
          entityId: estimate.id,
          previousState: estimate,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting estimate:", error);
        res.status(500).json({ message: "Failed to delete estimate" });
      }
    },
  );

  // ============================================================================
  // ESTIMATE ENGINE ROUTES (New Configurable Pricing System)
  // ============================================================================

  app.post(
    "/api/estimates/engine/preview",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const { EstimateEngine } = await import("./services/estimateEngine");

        const preview = await EstimateEngine.preview({
          companyId: companyId!,
          mode: req.body.mode || "internal",
          customerId: req.body.customerId,
          pricingProfileId: req.body.pricingProfileId,
          inputs: req.body.inputs || {},
          workItems: req.body.workItems || [],
          options: req.body.options,
        });

        res.json(preview);
      } catch (error) {
        console.error("Error previewing estimate:", error);
        res.status(500).json({ message: "Failed to preview estimate" });
      }
    },
  );

  app.post(
    "/api/estimates/:id/engine/finalize",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { EstimateEngine } = await import("./services/estimateEngine");

        const estimate = await storage.getEstimate(companyId!, req.params.id);
        if (!estimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        const result = await EstimateEngine.finalize(
          companyId!,
          req.params.id,
          req.body.preview,
          userId,
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "estimate.finalized",
          entityType: "estimate",
          entityId: req.params.id,
          newState: { snapshotId: result.snapshotId },
        });

        res.json(result);
      } catch (error: any) {
        console.error("Error finalizing estimate:", error);
        res.status(400).json({ message: error.message || "Failed to finalize estimate" });
      }
    },
  );

  // ============================================================================
  // ESTIMATE FIELDS (Configurable Field Registry)
  // ============================================================================

  app.get(
    "/api/estimate-fields",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const fields = await storage.getEstimateFields(companyId!);
        res.json(fields);
      } catch (error) {
        console.error("Error fetching estimate fields:", error);
        res.status(500).json({ message: "Failed to fetch estimate fields" });
      }
    },
  );

  app.post(
    "/api/estimate-fields",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const field = await storage.createEstimateField({
          ...req.body,
          companyId: companyId!,
        });
        res.status(201).json(field);
      } catch (error) {
        console.error("Error creating estimate field:", error);
        res.status(500).json({ message: "Failed to create estimate field" });
      }
    },
  );

  app.patch(
    "/api/estimate-fields/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const field = await storage.updateEstimateField(companyId!, req.params.id, req.body);
        if (!field) {
          return res.status(404).json({ message: "Estimate field not found" });
        }
        res.json(field);
      } catch (error) {
        console.error("Error updating estimate field:", error);
        res.status(500).json({ message: "Failed to update estimate field" });
      }
    },
  );

  app.delete(
    "/api/estimate-fields/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const success = await storage.deleteEstimateField(companyId!, req.params.id);
        if (!success) {
          return res.status(404).json({ message: "Estimate field not found" });
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting estimate field:", error);
        res.status(500).json({ message: "Failed to delete estimate field" });
      }
    },
  );

  // ============================================================================
  // PRICING PROFILES
  // ============================================================================

  app.get(
    "/api/pricing-profiles",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const profiles = await storage.getPricingProfiles(companyId!);
        res.json(profiles);
      } catch (error) {
        console.error("Error fetching pricing profiles:", error);
        res.status(500).json({ message: "Failed to fetch pricing profiles" });
      }
    },
  );

  app.post(
    "/api/pricing-profiles",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const profile = await storage.createPricingProfile({
          ...req.body,
          companyId: companyId!,
        });
        res.status(201).json(profile);
      } catch (error) {
        console.error("Error creating pricing profile:", error);
        res.status(500).json({ message: "Failed to create pricing profile" });
      }
    },
  );

  app.patch(
    "/api/pricing-profiles/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const profile = await storage.updatePricingProfile(companyId!, req.params.id, req.body);
        if (!profile) {
          return res.status(404).json({ message: "Pricing profile not found" });
        }
        res.json(profile);
      } catch (error) {
        console.error("Error updating pricing profile:", error);
        res.status(500).json({ message: "Failed to update pricing profile" });
      }
    },
  );

  app.delete(
    "/api/pricing-profiles/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const success = await storage.deletePricingProfile(companyId!, req.params.id);
        if (!success) {
          return res.status(404).json({ message: "Pricing profile not found" });
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting pricing profile:", error);
        res.status(500).json({ message: "Failed to delete pricing profile" });
      }
    },
  );

  // ============================================================================
  // PRICING RULES
  // ============================================================================

  app.get(
    "/api/pricing-rules",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const profileId = req.query.profileId as string | undefined;
        const rules = await storage.getPricingRules(companyId!, profileId);
        res.json(rules);
      } catch (error) {
        console.error("Error fetching pricing rules:", error);
        res.status(500).json({ message: "Failed to fetch pricing rules" });
      }
    },
  );

  app.post(
    "/api/pricing-rules",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const rule = await storage.createPricingRule({
          ...req.body,
          companyId: companyId!,
        });
        res.status(201).json(rule);
      } catch (error) {
        console.error("Error creating pricing rule:", error);
        res.status(500).json({ message: "Failed to create pricing rule" });
      }
    },
  );

  app.patch(
    "/api/pricing-rules/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const rule = await storage.updatePricingRule(companyId!, req.params.id, req.body);
        if (!rule) {
          return res.status(404).json({ message: "Pricing rule not found" });
        }
        res.json(rule);
      } catch (error) {
        console.error("Error updating pricing rule:", error);
        res.status(500).json({ message: "Failed to update pricing rule" });
      }
    },
  );

  app.delete(
    "/api/pricing-rules/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const success = await storage.deletePricingRule(companyId!, req.params.id);
        if (!success) {
          return res.status(404).json({ message: "Pricing rule not found" });
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting pricing rule:", error);
        res.status(500).json({ message: "Failed to delete pricing rule" });
      }
    },
  );

  // ============================================================================
  // ESTIMATE TOOL CONFIG ROUTES
  // ============================================================================

  app.get(
    "/api/estimate-tool-config",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const config = await storage.getEstimateToolConfig(companyId!);
        res.json(config || null);
      } catch (error) {
        console.error("Error fetching estimate tool config:", error);
        res.status(500).json({ message: "Failed to fetch estimate tool config" });
      }
    },
  );

  app.put(
    "/api/estimate-tool-config",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const config = await storage.upsertEstimateToolConfig({
          companyId: companyId!,
          configData: req.body,
        });
        res.json(config);
      } catch (error) {
        console.error("Error saving estimate tool config:", error);
        res.status(500).json({ message: "Failed to save estimate tool config" });
      }
    },
  );

  // ============================================================================
  // PORTAL ROUTES (PUBLIC - for customers via magic link)
  // ============================================================================

  const portalRateLimitMap = new Map<
    string,
    { count: number; resetAt: number }
  >();
  const PORTAL_RATE_LIMIT = 10;
  const PORTAL_RATE_WINDOW = 60 * 1000;

  function checkPortalRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = portalRateLimitMap.get(ip);

    if (!record || now > record.resetAt) {
      portalRateLimitMap.set(ip, {
        count: 1,
        resetAt: now + PORTAL_RATE_WINDOW,
      });
      return true;
    }

    if (record.count >= PORTAL_RATE_LIMIT) {
      return false;
    }

    record.count++;
    return true;
  }

  app.get("/api/portal/estimates/:token", async (req: any, res: Response) => {
    try {
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      if (!checkPortalRateLimit(clientIp)) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      }

      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const estimate = await storage.getEstimateByTokenHashForView(tokenHash);
      if (!estimate) {
        console.log(
          "[portal.token.invalid] Unknown token attempted, IP:",
          clientIp,
        );
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (
        estimate.magicLinkExpiresAt &&
        new Date() > estimate.magicLinkExpiresAt
      ) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.token.expired",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token expired",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (estimate.magicLinkUsedAt) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.token.used",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token already used",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const latestSnapshot =
        await storage.getLatestEstimateSnapshotByEstimateId(estimate.id);
      const customer = await storage.getCustomer(
        estimate.companyId,
        estimate.customerId,
      );
      const company = await storage.getCompany(estimate.companyId);

      await storage.createAuditLogEntry({
        companyId: estimate.companyId,
        action: "portal.estimate.viewed",
        entityType: "estimate",
        entityId: estimate.id,
        newState: {
          status: estimate.status,
          viewedAt: new Date().toISOString(),
        },
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        estimate: {
          id: estimate.id,
          estimateNumber: estimate.estimateNumber,
          status: estimate.status,
          title: estimate.title,
          description: estimate.description,
          validUntil: estimate.validUntil,
          sentAt: estimate.sentAt,
          approvedAt: estimate.approvedAt,
          rejectedAt: estimate.rejectedAt,
          isActionable: estimate.status === "sent",
        },
        snapshot: latestSnapshot
          ? {
              workItemsSnapshot: latestSnapshot.workItemsSnapshot,
              pricingBreakdown: latestSnapshot.pricingBreakdown,
              subtotal: latestSnapshot.subtotal,
              taxRate: latestSnapshot.taxRate,
              taxAmount: latestSnapshot.taxAmount,
              total: latestSnapshot.total,
            }
          : null,
        customer: customer
          ? {
              name: `${customer.firstName} ${customer.lastName}`.trim(),
            }
          : null,
        company: company
          ? {
              name: company.name,
            }
          : null,
      });
    } catch (error) {
      console.error("Error fetching portal estimate:", error);
      res.status(500).json({ message: "Failed to fetch estimate" });
    }
  });

  app.post("/api/portal/estimates/:token/approve", async (req: any, res: Response) => {
    try {
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      if (!checkPortalRateLimit(clientIp)) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      }

      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const estimate = await storage.getEstimateByTokenHashForView(tokenHash);
      if (!estimate) {
        console.log(
          "[portal.approve.token_invalid] Unknown token attempted, IP:",
          clientIp,
        );
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (
        estimate.magicLinkExpiresAt &&
        new Date() > estimate.magicLinkExpiresAt
      ) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.approve.token_expired",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token expired",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (estimate.magicLinkUsedAt) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.approve.token_used",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token already used",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (estimate.status !== "sent") {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.approve.invalid_status",
          entityType: "estimate",
          entityId: estimate.id,
          reason: `Cannot approve estimate in status: ${estimate.status}`,
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const markedEstimate = await storage.markMagicLinkUsed(estimate.id);
      if (!markedEstimate) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.approve.race_condition",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token marked used by concurrent request",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const latestSnapshot =
        await storage.getLatestEstimateSnapshotByEstimateId(estimate.id);
      
      if (!latestSnapshot) {
        return res.status(400).json({ message: "No estimate snapshot found. Cannot approve." });
      }
      
      const snapshotVersion = (latestSnapshot.snapshotVersion || 0) + 1;

      await storage.createEstimateSnapshot({
        estimateId: estimate.id,
        snapshotVersion,
        triggerAction: "approve",
        costProfileSnapshotId: latestSnapshot.costProfileSnapshotId,
        workItemsSnapshot: latestSnapshot?.workItemsSnapshot || [],
        pricingBreakdown: latestSnapshot?.pricingBreakdown || {},
        subtotal: latestSnapshot?.subtotal || "0",
        taxRate: latestSnapshot?.taxRate || "0",
        taxAmount: latestSnapshot?.taxAmount || "0",
        total: latestSnapshot?.total || "0",
        marginPercentage: latestSnapshot?.marginPercentage || "0",
        isOverride: latestSnapshot?.isOverride || false,
        overrideReason: latestSnapshot?.overrideReason,
        overrideMultiplier: latestSnapshot?.overrideMultiplier,
        floorViolation: latestSnapshot?.floorViolation || false,
        previousStatus: estimate.status,
        newStatus: "approved",
        actorId: null,
        actorType: "customer",
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      await storage.updateEstimate(estimate.companyId, estimate.id, {
        status: "approved",
        approvedAt: new Date(),
      });

      await storage.createAuditLogEntry({
        companyId: estimate.companyId,
        action: "portal.estimate.approved",
        entityType: "estimate",
        entityId: estimate.id,
        previousState: { status: estimate.status },
        newState: { status: "approved", snapshotVersion },
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      // Automatically generate contract upon estimate approval
      let contractData = null;
      try {
        const customer = await storage.getCustomer(estimate.companyId, estimate.customerId);
        const company = await storage.getCompany(estimate.companyId);
        
        if (customer && company && latestSnapshot) {
          const contractResult = await generateContractFromEstimate({
            estimate: { ...estimate, status: "approved", approvedAt: new Date() },
            snapshot: latestSnapshot,
            customer,
            company,
          });
          
          const contractUrl = await getContractMagicLinkUrl(contractResult.magicLinkToken);
          contractData = {
            contractId: contractResult.contract.id,
            contractNumber: contractResult.contract.contractNumber,
            contractUrl,
          };

          await storage.createAuditLogEntry({
            companyId: estimate.companyId,
            action: "contract.auto_generated_on_approval",
            entityType: "contract",
            entityId: contractResult.contract.id,
            newState: { 
              estimateId: estimate.id,
              contractNumber: contractResult.contract.contractNumber,
            },
            ipAddress: clientIp,
            userAgent: req.get("User-Agent"),
          });
        }
      } catch (contractError) {
        console.error("Error generating contract on approval:", contractError);
        // Don't fail the approval if contract generation fails
      }

      res.json({
        estimate: { ...estimate, status: "approved", approvedAt: new Date() },
        message: "Estimate approved successfully",
        contract: contractData,
      });
    } catch (error) {
      console.error("Error approving estimate:", error);
      res.status(500).json({ message: "Failed to approve estimate" });
    }
  });

  app.post("/api/portal/estimates/:token/reject", async (req: any, res: Response) => {
    try {
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      if (!checkPortalRateLimit(clientIp)) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      }

      const { token } = req.params;
      const { reason } = req.body;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const estimate = await storage.getEstimateByTokenHashForView(tokenHash);
      if (!estimate) {
        console.log(
          "[portal.reject.token_invalid] Unknown token attempted, IP:",
          clientIp,
        );
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (
        estimate.magicLinkExpiresAt &&
        new Date() > estimate.magicLinkExpiresAt
      ) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.reject.token_expired",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token expired",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (estimate.magicLinkUsedAt) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.reject.token_used",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token already used",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (estimate.status !== "sent") {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.reject.invalid_status",
          entityType: "estimate",
          entityId: estimate.id,
          reason: `Cannot reject estimate in status: ${estimate.status}`,
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const markedEstimate = await storage.markMagicLinkUsed(estimate.id);
      if (!markedEstimate) {
        await storage.createAuditLogEntry({
          companyId: estimate.companyId,
          action: "portal.reject.race_condition",
          entityType: "estimate",
          entityId: estimate.id,
          reason: "Token marked used by concurrent request",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const latestSnapshot =
        await storage.getLatestEstimateSnapshotByEstimateId(estimate.id);
      
      if (!latestSnapshot) {
        return res.status(400).json({ message: "No estimate snapshot found. Cannot reject." });
      }
      
      const snapshotVersion = (latestSnapshot.snapshotVersion || 0) + 1;

      await storage.createEstimateSnapshot({
        estimateId: estimate.id,
        snapshotVersion,
        triggerAction: "reject",
        costProfileSnapshotId: latestSnapshot.costProfileSnapshotId,
        workItemsSnapshot: latestSnapshot.workItemsSnapshot as any,
        pricingBreakdown: latestSnapshot.pricingBreakdown as any,
        subtotal: latestSnapshot.subtotal,
        taxRate: latestSnapshot.taxRate,
        taxAmount: latestSnapshot.taxAmount,
        total: latestSnapshot.total,
        marginPercentage: latestSnapshot.marginPercentage,
        isOverride: latestSnapshot.isOverride,
        overrideReason: latestSnapshot.overrideReason,
        overrideMultiplier: latestSnapshot.overrideMultiplier,
        floorViolation: latestSnapshot.floorViolation,
        previousStatus: estimate.status,
        newStatus: "rejected",
        actorId: null,
        actorType: "customer",
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      await storage.updateEstimate(estimate.companyId, estimate.id, {
        status: "rejected",
        rejectedAt: new Date(),
      });

      await storage.createAuditLogEntry({
        companyId: estimate.companyId,
        action: "portal.estimate.rejected",
        entityType: "estimate",
        entityId: estimate.id,
        previousState: { status: estimate.status },
        newState: { status: "rejected", snapshotVersion, reason },
        reason,
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      res.json({ success: true, message: "Estimate rejected" });
    } catch (error) {
      console.error("Error rejecting estimate:", error);
      res.status(500).json({ message: "Failed to reject estimate" });
    }
  });

  // ============================================================================
  // INVOICE PORTAL ROUTES (public - no authentication required)
  // ============================================================================
  app.get("/api/portal/invoices/:token", async (req: any, res: Response) => {
    try {
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      if (!checkPortalRateLimit(clientIp)) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      }

      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const invoice = await storage.getInvoiceByTokenHashForView(tokenHash);
      if (!invoice) {
        console.log(
          "[portal.invoice.token.invalid] Unknown token attempted, IP:",
          clientIp,
        );
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (
        invoice.magicLinkExpiresAt &&
        new Date() > invoice.magicLinkExpiresAt
      ) {
        await storage.createAuditLogEntry({
          companyId: invoice.companyId,
          action: "portal.invoice.token.expired",
          entityType: "invoice",
          entityId: invoice.id,
          reason: "Token expired",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const customer = await storage.getCustomer(
        invoice.companyId,
        invoice.customerId,
      );
      const company = await storage.getCompany(invoice.companyId);

      await storage.createAuditLogEntry({
        companyId: invoice.companyId,
        action: "portal.invoice.viewed",
        entityType: "invoice",
        entityId: invoice.id,
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      let paymentUrl: string | undefined;
      if (
        (invoice.status === "sent" || invoice.status === "partially_paid") &&
        invoice.stripeCheckoutSessionId
      ) {
        try {
          const { getStripe } = await import("./stripeClient");
          const stripe = getStripe();
          const session = await stripe.checkout.sessions.retrieve(
            invoice.stripeCheckoutSessionId,
          );
          if (session.status === "open" && session.url) {
            paymentUrl = session.url;
          }
        } catch (err) {
          console.log(
            "[portal.invoice] Could not retrieve Stripe session:",
            err,
          );
        }
      }

      res.json({
        invoice: {
          ...invoice,
          customer: customer || null,
          company: company ? { name: company.name } : null,
        },
        paymentUrl,
      });
    } catch (error) {
      console.error("Error fetching invoice for portal:", error);
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  // ============================================================================
  // CONTRACT PORTAL ROUTES (public - no authentication required)
  // ============================================================================
  app.get("/api/portal/contracts/:token", async (req: any, res: Response) => {
    try {
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      if (!checkPortalRateLimit(clientIp)) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      }

      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const contract = await storage.getContractByTokenHash(tokenHash);
      if (!contract) {
        console.log(
          "[portal.contract.token.invalid] Unknown token attempted, IP:",
          clientIp,
        );
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (
        contract.magicLinkExpiresAt &&
        new Date() > contract.magicLinkExpiresAt
      ) {
        await storage.createAuditLogEntry({
          companyId: contract.companyId,
          action: "portal.contract.token.expired",
          entityType: "contract",
          entityId: contract.id,
          reason: "Token expired",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const customer = await storage.getCustomer(
        contract.companyId,
        contract.customerId,
      );
      const company = await storage.getCompany(contract.companyId);

      await storage.createAuditLogEntry({
        companyId: contract.companyId,
        action: "portal.contract.viewed",
        entityType: "contract",
        entityId: contract.id,
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        contract: {
          id: contract.id,
          contractNumber: contract.contractNumber,
          status: contract.status,
          headerContent: contract.headerContent,
          workItemsContent: contract.workItemsContent,
          termsContent: contract.termsContent,
          footerContent: contract.footerContent,
          estimateSnapshot: contract.estimateSnapshot,
          signedAt: contract.signedAt,
          signerName: contract.signerName,
          signerInitials: contract.signerInitials,
          signatureData: contract.signatureData,
          createdAt: contract.createdAt,
        },
        customer: customer
          ? {
              name: `${customer.firstName} ${customer.lastName}`.trim(),
              email: customer.email,
            }
          : null,
        company: company
          ? {
              name: company.name,
            }
          : null,
        isSigned: contract.status === "signed",
      });
    } catch (error) {
      console.error("Error fetching contract for portal:", error);
      res.status(500).json({ message: "Failed to fetch contract" });
    }
  });

  app.post("/api/portal/contracts/:token/sign", async (req: any, res: Response) => {
    try {
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      if (!checkPortalRateLimit(clientIp)) {
        return res
          .status(429)
          .json({ message: "Too many requests. Please try again later." });
      }

      const { token } = req.params;
      const { signerName, signerInitials, signatureData, signatureType } = req.body;

      if (!signerName) {
        return res
          .status(400)
          .json({ message: "Signer name is required" });
      }

      const hasValidSignature = 
        (signatureType === "drawn" && signatureData) ||
        (signatureType === "typed" && signerInitials) ||
        (signerInitials);

      if (!hasValidSignature) {
        return res
          .status(400)
          .json({ message: "A signature (drawn or typed initials) is required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const contract = await storage.getContractByTokenHash(tokenHash);
      if (!contract) {
        console.log(
          "[portal.contract.sign.token_invalid] Unknown token attempted, IP:",
          clientIp,
        );
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (
        contract.magicLinkExpiresAt &&
        new Date() > contract.magicLinkExpiresAt
      ) {
        await storage.createAuditLogEntry({
          companyId: contract.companyId,
          action: "portal.contract.sign.token_expired",
          entityType: "contract",
          entityId: contract.id,
          reason: "Token expired",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (contract.magicLinkUsedAt) {
        await storage.createAuditLogEntry({
          companyId: contract.companyId,
          action: "portal.contract.sign.token_used",
          entityType: "contract",
          entityId: contract.id,
          reason: "Token already used",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      if (contract.status !== "sent") {
        await storage.createAuditLogEntry({
          companyId: contract.companyId,
          action: "portal.contract.sign.invalid_status",
          entityType: "contract",
          entityId: contract.id,
          reason: `Cannot sign contract in status: ${contract.status}`,
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const markedContract = await storage.markContractMagicLinkUsed(contract.id);
      if (!markedContract) {
        await storage.createAuditLogEntry({
          companyId: contract.companyId,
          action: "portal.contract.sign.race_condition",
          entityType: "contract",
          entityId: contract.id,
          reason: "Token marked used by concurrent request",
          ipAddress: clientIp,
          userAgent: req.get("User-Agent"),
        });
        return res
          .status(PORTAL_TOKEN_ERROR_STATUS)
          .json(PORTAL_TOKEN_ERROR_RESPONSE);
      }

      const signedAt = new Date();

      // Create immutable signed contract snapshot BEFORE updating contract
      await storage.createSignedContractSnapshot({
        contractId: contract.id,
        companyId: contract.companyId,
        headerContent: contract.headerContent,
        workItemsContent: contract.workItemsContent,
        termsContent: contract.termsContent,
        footerContent: contract.footerContent,
        estimateSnapshot: contract.estimateSnapshot as any,
        signedAt,
        signerName,
        signerInitials: signerInitials || null,
        signatureData: signatureData || null,
        signerIpAddress: clientIp,
        signerUserAgent: req.get("User-Agent") || null,
      });

      // Use dedicated signContract method which enforces proper state transitions
      // This also sets lockedAt internally to lock the contract
      const updatedContract = await storage.signContract(
        contract.companyId,
        contract.id,
        {
          signedAt,
          signerName,
          signerInitials,
          signatureData: signatureData || null,
          signerIpAddress: clientIp,
          signerUserAgent: req.get("User-Agent") || null,
        },
      );

      await storage.createAuditLogEntry({
        companyId: contract.companyId,
        action: "portal.contract.signed",
        entityType: "contract",
        entityId: contract.id,
        previousState: { status: contract.status },
        newState: { 
          status: "signed", 
          signerName, 
          signerInitials,
        },
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        contract: {
          ...updatedContract,
        },
        message: "Contract signed successfully",
      });
    } catch (error) {
      console.error("Error signing contract:", error);
      res.status(500).json({ message: "Failed to sign contract" });
    }
  });

  // ============================================================================
  // CONTRACT ROUTES (authenticated)
  // ============================================================================
  app.get(
    "/api/contracts",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const contracts = await storage.getContracts(companyId!);

        const enrichedContracts = await Promise.all(
          contracts.map(async (contract) => {
            const customer = await storage.getCustomer(
              companyId!,
              contract.customerId,
            );
            return {
              ...contract,
              customer: customer || null,
            };
          }),
        );

        res.json(enrichedContracts);
      } catch (error) {
        console.error("Error fetching contracts:", error);
        res.status(500).json({ message: "Failed to fetch contracts" });
      }
    },
  );

  app.get(
    "/api/contracts/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const { id } = req.params;

        const contract = await storage.getContract(companyId!, id);
        if (!contract) {
          return res.status(404).json({ message: "Contract not found" });
        }

        const customer = await storage.getCustomer(
          companyId!,
          contract.customerId,
        );
        const company = await storage.getCompany(companyId!);
        const estimate = contract.estimateId
          ? await storage.getEstimate(companyId!, contract.estimateId)
          : null;

        // Include immutable signed snapshot if contract is signed
        let signedSnapshot = null;
        if (contract.status === "signed" || contract.lockedAt) {
          signedSnapshot = await storage.getSignedContractSnapshot(contract.id);
        }

        res.json({
          ...contract,
          customer: customer || null,
          company: company || null,
          estimate: estimate || null,
          signedSnapshot: signedSnapshot || null,
        });
      } catch (error) {
        console.error("Error fetching contract:", error);
        res.status(500).json({ message: "Failed to fetch contract" });
      }
    },
  );

  app.post(
    "/api/contracts/:id/send",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const { id } = req.params;
        const { deliveryMethod = "email" } = req.body;

        const contract = await storage.getContract(companyId!, id);
        if (!contract) {
          return res.status(404).json({ message: "Contract not found" });
        }

        // Block sending for terminal statuses
        const terminalStatuses = ["signed", "voided", "expired"];
        if (terminalStatuses.includes(contract.status)) {
          return res.status(409).json({
            message: `Cannot send contract in status: ${contract.status}. Signed, voided, and expired contracts cannot be re-sent.`,
          });
        }

        if (contract.status !== "draft" && contract.status !== "sent") {
          return res.status(400).json({
            message: `Cannot send contract in status: ${contract.status}`,
          });
        }

        const customer = await storage.getCustomer(companyId!, contract.customerId);
        if (!customer) {
          return res.status(400).json({ message: "Customer not found" });
        }

        const company = await storage.getCompany(companyId!);
        if (!company) {
          return res.status(400).json({ message: "Company not found" });
        }

        const newMagicLinkToken = crypto.randomBytes(32).toString('hex');
        const newMagicLinkTokenHash = crypto.createHash('sha256').update(newMagicLinkToken).digest('hex');
        const newMagicLinkExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await storage.updateContract(companyId!, contract.id, {
          magicLinkTokenHash: newMagicLinkTokenHash,
          magicLinkExpiresAt: newMagicLinkExpiresAt,
        });

        const { getContractMagicLinkUrl } = await import("./services/contractService");
        const contractUrl = await getContractMagicLinkUrl(newMagicLinkToken);

        const snapshot = contract.estimateSnapshot as any;
        const total = snapshot?.total || "0";
        const customerName = `${customer.firstName} ${customer.lastName}`.trim();

        let emailSent = false;
        let smsSent = false;

        if (deliveryMethod === "email" || deliveryMethod === "both") {
          console.log(`[contract.send] Sending email to ${customer.email}`);
          emailSent = true;
        }

        if (deliveryMethod === "sms" || deliveryMethod === "both") {
          const { sendContractSMS, isTwilioConfigured } = await import("./services/smsService");
          if (isTwilioConfigured() && customer.phone) {
            const result = await sendContractSMS({
              to: customer.phone,
              customerName,
              companyName: company.name,
              contractTotal: total,
              magicLinkUrl: contractUrl,
            });
            smsSent = result.success;
            if (!result.success) {
              console.error(`[contract.send] SMS failed: ${result.error}`);
            }
          }
        }

        if (contract.status === "draft") {
          await storage.updateContract(companyId!, contract.id, {
            status: "sent",
            sentAt: new Date(),
          });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          action: "contract.sent",
          entityType: "contract",
          entityId: contract.id,
          newState: { deliveryMethod, emailSent, smsSent },
        });

        res.json({
          message: "Contract sent successfully",
          emailSent,
          smsSent,
        });
      } catch (error) {
        console.error("Error sending contract:", error);
        res.status(500).json({ message: "Failed to send contract" });
      }
    },
  );

  // Get signed contract snapshot (immutable, legally defensible version)
  app.get(
    "/api/contracts/:id/signed-snapshot",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const { id } = req.params;

        const contract = await storage.getContract(companyId!, id);
        if (!contract) {
          return res.status(404).json({ message: "Contract not found" });
        }

        if (contract.status !== "signed" && !contract.lockedAt) {
          return res.status(400).json({ message: "Contract has not been signed" });
        }

        const snapshot = await storage.getSignedContractSnapshot(id);
        if (!snapshot) {
          return res.status(404).json({ message: "Signed snapshot not found" });
        }

        res.json(snapshot);
      } catch (error) {
        console.error("Error fetching signed contract snapshot:", error);
        res.status(500).json({ message: "Failed to fetch signed snapshot" });
      }
    },
  );

  // Void contract (Admin only)
  app.post(
    "/api/contracts/:id/void",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
          return res.status(400).json({ message: "Void reason is required" });
        }

        const contract = await storage.getContract(companyId!, id);
        if (!contract) {
          return res.status(404).json({ message: "Contract not found" });
        }

        const previousStatus = contract.status;

        // Use dedicated voidContract method which enforces proper state transitions
        const updatedContract = await storage.voidContract(
          companyId!,
          id,
          reason.trim(),
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "contract.voided",
          entityType: "contract",
          entityId: id,
          previousState: { status: previousStatus },
          newState: { status: "voided", reason: reason.trim() },
          reason: reason.trim(),
        });

        res.json({
          ...updatedContract,
          message: "Contract voided successfully",
        });
      } catch (error) {
        console.error("Error voiding contract:", error);
        res.status(500).json({ message: "Failed to void contract" });
      }
    },
  );

  // ============================================================================
  // INVOICE ROUTES
  // ============================================================================
  app.get(
    "/api/invoices",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        const invoicesList = await storage.getInvoices(companyId!);

        const enrichedInvoices = await Promise.all(
          invoicesList.map(async (invoice) => {
            const customer = await storage.getCustomer(
              companyId!,
              invoice.customerId,
            );
            return {
              ...invoice,
              customer: customer || null,
            };
          }),
        );

        res.json(enrichedInvoices);
      } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ message: "Failed to fetch invoices" });
      }
    },
  );

  app.get(
    "/api/invoices/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        const invoice = await storage.getInvoice(companyId!, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const [customer, payments] = await Promise.all([
          storage.getCustomer(companyId!, invoice.customerId),
          storage.getPayments(companyId!, invoice.id),
        ]);

        res.json({ ...invoice, customer, payments });
      } catch (error) {
        console.error("Error fetching invoice:", error);
        res.status(500).json({ message: "Failed to fetch invoice" });
      }
    },
  );

  app.post(
    "/api/invoices/from-estimate",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const { estimateId, invoiceType = "full", dueDate } = req.body;

        if (!estimateId) {
          return res.status(400).json({ message: "Estimate ID is required" });
        }

        const estimate = await storage.getEstimate(companyId!, estimateId);
        if (!estimate) {
          return res.status(404).json({ message: "Estimate not found" });
        }

        if (estimate.status !== "approved") {
          return res
            .status(409)
            .json({ message: "Only approved estimates can be invoiced" });
        }

        const latestSnapshot = await storage.getLatestEstimateSnapshot(
          companyId!,
          estimateId,
        );
        if (!latestSnapshot) {
          return res
            .status(400)
            .json({ message: "No pricing snapshot found for this estimate" });
        }

        const existingInvoices = await storage.getInvoicesByEstimateId(
          companyId!,
          estimateId,
        );
        if (existingInvoices.length > 0 && invoiceType === "full") {
          return res
            .status(409)
            .json({ message: "An invoice already exists for this estimate" });
        }

        const invoiceNumber = await storage.generateInvoiceNumber(companyId!);

        const workItemsSnapshot = latestSnapshot.workItemsSnapshot as any[];
        const lineItems = workItemsSnapshot.map((item: any) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          amount: item.quantity * item.unitPrice,
        }));

        const invoice = await storage.createInvoice({
          companyId: companyId!,
          customerId: estimate.customerId,
          estimateId: estimate.id,
          estimateSnapshotId: latestSnapshot.id,
          invoiceNumber,
          invoiceType,
          status: "draft",
          title: estimate.title || `Invoice for ${invoiceNumber}`,
          description: estimate.description,
          lineItems,
          subtotal: latestSnapshot.subtotal,
          taxRate: latestSnapshot.taxRate,
          taxAmount: latestSnapshot.taxAmount,
          total: latestSnapshot.total,
          amountPaid: "0.00",
          amountDue: latestSnapshot.total,
          dueDate: dueDate ? new Date(dueDate) : null,
          createdBy: userId,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.created_from_estimate",
          entityType: "invoice",
          entityId: invoice.id,
          newState: { invoiceNumber, estimateId, invoiceType },
        });

        res.json(invoice);
      } catch (error) {
        console.error("Error creating invoice from estimate:", error);
        res.status(500).json({ message: "Failed to create invoice" });
      }
    },
  );

  app.post(
    "/api/invoices/:id/send",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const invoice = await storage.getInvoice(companyId!, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        try {
          assertInvoiceTransition(invoice.status, "sent");
        } catch (err: any) {
          return res.status(err.status || 400).json({ message: err.message });
        }

        const { deliveryMethod } = req.body;
        const sendSms = deliveryMethod === 'sms' || deliveryMethod === 'both';

        const magicToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(magicToken)
          .digest("hex");
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const updatedInvoice = await storage.updateInvoice(
          companyId!,
          invoice.id,
          {
            status: "sent",
            sentAt: new Date(),
            magicLinkTokenHash: tokenHash,
            magicLinkExpiresAt: expiresAt,
          },
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.sent",
          entityType: "invoice",
          entityId: invoice.id,
          previousState: { status: invoice.status },
          newState: { status: "sent" },
        });

        let smsResult = null;
        if (sendSms) {
          const customer = await storage.getCustomer(companyId!, invoice.customerId);
          const company = await storage.getCompany(companyId!);
          if (customer?.phone) {
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
              ? `https://${process.env.REPLIT_DEV_DOMAIN}`
              : process.env.BASE_URL || 'http://localhost:5000';
            const magicLinkUrl = `${baseUrl}/portal/invoices/${magicToken}`;
            
            smsResult = await sendInvoiceSMS({
              to: customer.phone,
              customerName: `${customer.firstName} ${customer.lastName}`.trim(),
              companyName: company?.name || 'Your Tree Service',
              invoiceTotal: invoice.total,
              magicLinkUrl,
              dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : undefined,
            });

            if (!smsResult.success) {
              console.error('SMS delivery failed:', smsResult.error);
            }
          } else {
            smsResult = { success: false, error: 'Customer has no phone number' };
          }
        }

        res.json({
          ...updatedInvoice,
          magicLinkToken: magicToken,
          portalUrl: `/portal/invoices/${magicToken}`,
          smsDelivery: sendSms ? smsResult : undefined,
        });
      } catch (error) {
        console.error("Error sending invoice:", error);
        res.status(500).json({ message: "Failed to send invoice" });
      }
    },
  );

  app.post(
    "/api/invoices/:id/pay-link",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const invoice = await storage.getInvoice(companyId!, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        try {
          assertInvoiceNotPaid(invoice.status);
        } catch (err: any) {
          return res.status(err.status || 400).json({ message: err.message });
        }

        const amountDue = parseFloat(invoice.amountDue || "0");
        if (amountDue <= 0) {
          return res.status(409).json({ message: "Invoice has no amount due" });
        }

        const customer = await storage.getCustomer(
          companyId!,
          invoice.customerId,
        );
        const company = await storage.getCompany(companyId!);

        const { getStripe } = await import("./stripeClient");
        const stripe = getStripe();

        const lineItems = (invoice.lineItems as any[]).map((item) => ({
          price_data: {
            currency: "usd",
            product_data: {
              name: item.description || "Service",
            },
            unit_amount: Math.round(item.unitPrice * 100),
          },
          quantity: item.quantity || 1,
        }));

        if (parseFloat(invoice.taxAmount) > 0) {
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: {
                name: "Tax",
              },
              unit_amount: Math.round(parseFloat(invoice.taxAmount) * 100),
            },
            quantity: 1,
          });
        }

        const baseUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
            : "http://localhost:5000";

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: lineItems,
          success_url: `${baseUrl}/invoices/${invoice.id}?payment=success`,
          cancel_url: `${baseUrl}/invoices/${invoice.id}?payment=cancelled`,
          customer_email: customer?.email || undefined,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            companyId: companyId!,
          },
        });

        await storage.updateInvoice(companyId!, invoice.id, {
          stripeCheckoutSessionId: session.id,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.pay_link_created",
          entityType: "invoice",
          entityId: invoice.id,
          newState: { checkoutSessionId: session.id },
        });

        res.json({
          checkoutUrl: session.url,
          sessionId: session.id,
        });
      } catch (error) {
        console.error("Error creating pay link:", error);
        res.status(500).json({ message: "Failed to create payment link" });
      }
    },
  );

  app.post(
    "/api/payments/offline",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const { invoiceId, amount, method, notes, referenceNumber } = req.body;

        if (!invoiceId || !amount || !method) {
          return res
            .status(400)
            .json({
              message: "Invoice ID, amount, and payment method are required",
            });
        }

        const validOfflineMethods = ["check", "cash", "bank_transfer", "other"];
        if (!validOfflineMethods.includes(method)) {
          return res
            .status(400)
            .json({
              message: `Invalid payment method. Must be one of: ${validOfflineMethods.join(", ")}`,
            });
        }

        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
          return res
            .status(400)
            .json({ message: "Amount must be a positive number" });
        }

        const invoice = await storage.getInvoice(companyId!, invoiceId);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const invalidPaymentStatuses = ["draft", "paid", "voided", "refunded", "written_off"];
        if (invalidPaymentStatuses.includes(invoice.status)) {
          return res
            .status(409)
            .json({
              message: `Cannot record payment for ${invoice.status} invoice`,
            });
        }

        const amountDue = parseFloat(invoice.amountDue || "0");
        if (paymentAmount > amountDue) {
          return res
            .status(400)
            .json({
              message: `Payment amount ($${paymentAmount}) exceeds amount due ($${amountDue})`,
            });
        }

        const newAmountPaid = parseFloat(invoice.amountPaid || "0") + paymentAmount;
        const newAmountDue = parseFloat(invoice.total || "0") - newAmountPaid;

        let newStatus: 'paid' | 'partially_paid' | typeof invoice.status;
        if (newAmountDue <= 0) {
          newStatus = "paid";
        } else if (newAmountPaid > 0) {
          newStatus = "partially_paid";
        } else {
          newStatus = invoice.status;
        }

        const txResult = await storage.recordOfflinePaymentTransactional(
          companyId!,
          invoice.id,
          invoice.version,
          {
            companyId: companyId!,
            invoiceId: invoice.id,
            amount: paymentAmount.toFixed(2),
            method: "offline",
            status: "succeeded",
            notes: `${method}: ${notes || ''}`.trim(),
            referenceNumber: referenceNumber || null,
            paidAt: new Date(),
            recordedBy: userId,
          },
          {
            amountPaid: newAmountPaid.toFixed(2),
            amountDue: newAmountDue.toFixed(2),
          }
        );

        if (!txResult.success) {
          return res.status(409).json({
            message: "Concurrent modification detected. The invoice was updated by another process. Please retry.",
            expectedVersion: invoice.version,
            currentVersion: txResult.currentVersion,
          });
        }

        const payment = txResult.payment;
        const updatedInvoice = txResult.invoice;

        if (newStatus === "paid" || newStatus === "partially_paid") {
          const { transitionInvoiceViaPayment } = await import("./services/invoiceStateTransition");
          const transitionResult = await transitionInvoiceViaPayment(
            updatedInvoice.id, 
            newStatus,
            newStatus === "paid" ? new Date() : undefined
          );
          if (!transitionResult.success) {
            console.error("Invoice state transition failed:", transitionResult);
            return res.status(409).json({ 
              message: "Payment recorded but invoice status transition failed",
              error: 'error' in transitionResult ? transitionResult.error : 'Unknown error',
              currentStatus: 'currentStatus' in transitionResult ? transitionResult.currentStatus : updatedInvoice.status,
            });
          }
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.offline_payment_recorded",
          entityType: "invoice",
          entityId: updatedInvoice.id,
          previousState: {
            status: invoice.status,
            amountPaid: invoice.amountPaid,
          },
          newState: {
            status: newStatus,
            amountPaid: updatedInvoice.amountPaid,
            paymentId: payment.id,
          },
        });

        res.json({
          payment,
          invoice: {
            id: updatedInvoice.id,
            status: newStatus,
            amountPaid: updatedInvoice.amountPaid,
            amountDue: updatedInvoice.amountDue,
          },
        });
      } catch (error) {
        console.error("Error recording offline payment:", error);
        res.status(500).json({ message: "Failed to record payment" });
      }
    },
  );

  app.post(
    "/api/invoices/:id/void",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const { reason } = req.body;
        if (!reason) {
          return res.status(400).json({ message: "Void reason is required" });
        }

        const invoice = await storage.getInvoice(companyId!, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        try {
          assertInvoiceTransition(invoice.status, "voided");
        } catch (err: any) {
          return res.status(err.status || 400).json({ message: err.message });
        }

        if (invoice.status === "paid" || invoice.status === "partially_paid") {
          return res
            .status(409)
            .json({
              message: "Cannot void invoice with payments. Use refund instead.",
            });
        }

        const updatedInvoice = await storage.updateInvoice(
          companyId!,
          invoice.id,
          {
            status: "voided",
            voidedAt: new Date(),
            voidReason: reason,
          },
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.voided",
          entityType: "invoice",
          entityId: invoice.id,
          previousState: { status: invoice.status },
          newState: { status: "voided", reason },
          reason,
        });

        res.json(updatedInvoice);
      } catch (error) {
        console.error("Error voiding invoice:", error);
        res.status(500).json({ message: "Failed to void invoice" });
      }
    },
  );

  app.post(
    "/api/billing/recalculate-ar-aging",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const { recalculateARAgingForCompany } = await import("./services/billingAuthority");
        
        const result = await recalculateARAgingForCompany(companyId!);
        
        res.json({
          message: "AR aging recalculation completed",
          processedCount: result.processedCount,
          overdueCount: result.overdueCount,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error recalculating AR aging:", error);
        res.status(500).json({ message: "Failed to recalculate AR aging" });
      }
    },
  );

  app.post(
    "/api/billing/invoices/:id/checkout",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const invoice = await storage.getInvoice(companyId!, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        const checkoutAllowedStates = ["sent", "viewed", "overdue", "partially_paid"];
        if (!checkoutAllowedStates.includes(invoice.status)) {
          return res.status(409).json({
            message: `Cannot create checkout for invoice in '${invoice.status}' status. Invoice must be sent, viewed, overdue, or partially paid.`,
          });
        }

        const amountDue = parseFloat(invoice.amountDue || "0");
        if (amountDue <= 0) {
          return res.status(409).json({ message: "Invoice has no amount due" });
        }

        const customer = await storage.getCustomer(companyId!, invoice.customerId);
        const company = await storage.getCompany(companyId!);

        const { getStripe } = await import("./stripeClient");
        const stripe = getStripe();

        const baseUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
            : "http://localhost:5000";

        const session = await stripe.checkout.sessions.create({
          payment_method_types: invoice.invoiceType === "deposit" ? ["card"] : ["card"],
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Invoice ${invoice.invoiceNumber}`,
                  description: invoice.title || `${invoice.invoiceType.toUpperCase()} Invoice`,
                },
                unit_amount: Math.round(amountDue * 100),
              },
              quantity: 1,
            },
          ],
          success_url: `${baseUrl}/invoices/${invoice.id}?payment=success`,
          cancel_url: `${baseUrl}/invoices/${invoice.id}?payment=cancelled`,
          customer_email: customer?.email || undefined,
          metadata: {
            invoiceId: invoice.id,
            companyId: companyId!,
            jobId: invoice.jobId || "",
            invoiceType: invoice.invoiceType,
            invoiceNumber: invoice.invoiceNumber,
          },
        });

        await storage.updateInvoice(companyId!, invoice.id, {
          stripeCheckoutSessionId: session.id,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.checkout_created",
          entityType: "invoice",
          entityId: invoice.id,
          newState: {
            checkoutSessionId: session.id,
            amountDue: amountDue.toFixed(2),
          },
        });

        res.json({
          url: session.url,
          sessionId: session.id,
        });
      } catch (error) {
        console.error("Error creating checkout session:", error);
        res.status(500).json({ message: "Failed to create checkout session" });
      }
    },
  );

  app.post(
    "/api/invoices/:id/refund",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Accountant"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const { reason, amount } = req.body;
        if (!reason) {
          return res.status(400).json({ message: "Refund reason is required" });
        }

        const invoice = await storage.getInvoice(companyId!, req.params.id);
        if (!invoice) {
          return res.status(404).json({ message: "Invoice not found" });
        }

        if (invoice.status === "voided" || invoice.status === "refunded") {
          return res
            .status(409)
            .json({ message: `Cannot refund ${invoice.status} invoice` });
        }

        const amountPaid = parseFloat(invoice.amountPaid || "0");
        if (amountPaid <= 0) {
          return res.status(409).json({ message: "No payments to refund" });
        }

        const refundAmount = amount ? parseFloat(amount) : amountPaid;
        if (refundAmount > amountPaid) {
          return res
            .status(400)
            .json({
              message: `Refund amount ($${refundAmount}) exceeds amount paid ($${amountPaid})`,
            });
        }

        if (invoice.stripePaymentIntentId) {
          try {
            const { getStripe } = await import("./stripeClient");
            const stripe = getStripe();

            await stripe.refunds.create({
              payment_intent: invoice.stripePaymentIntentId,
              amount: Math.round(refundAmount * 100),
            });
          } catch (stripeError: any) {
            console.error("Stripe refund error:", stripeError.message);
            return res
              .status(500)
              .json({
                message: `Stripe refund failed: ${stripeError.message}`,
              });
          }
        }

        await storage.createPayment({
          companyId: companyId!,
          invoiceId: invoice.id,
          amount: (-refundAmount).toFixed(2),
          method: invoice.stripePaymentIntentId ? "stripe" : "other",
          status: "completed",
          notes: `Refund: ${reason}`,
          paidAt: new Date(),
          recordedBy: userId,
        });

        const newAmountPaid = amountPaid - refundAmount;
        const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
        const isFullRefund = refundAmount >= amountPaid;

        const updatedInvoice = await storage.updateInvoice(
          companyId!,
          invoice.id,
          {
            status: isFullRefund ? "refunded" : "partially_paid",
            amountPaid: newAmountPaid.toFixed(2),
            amountDue: newAmountDue.toFixed(2),
          },
        );

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "invoice.refunded",
          entityType: "invoice",
          entityId: invoice.id,
          previousState: {
            status: invoice.status,
            amountPaid: invoice.amountPaid,
          },
          newState: {
            status: updatedInvoice?.status,
            amountPaid: newAmountPaid.toFixed(2),
            refundAmount,
          },
          reason,
        });

        res.json(updatedInvoice);
      } catch (error) {
        console.error("Error refunding invoice:", error);
        res.status(500).json({ message: "Failed to process refund" });
      }
    },
  );

  // ============================================================================
  // PAYMENT PLAN TEMPLATE ROUTES
  // ============================================================================
  app.get(
    "/api/payment-plan-templates",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const templates = await storage.getPaymentPlanTemplates(companyId!);
        res.json(templates);
      } catch (error) {
        console.error("Error fetching payment plan templates:", error);
        res.status(500).json({ message: "Failed to fetch payment plan templates" });
      }
    },
  );

  app.get(
    "/api/payment-plan-templates/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const template = await storage.getPaymentPlanTemplate(companyId!, req.params.id);
        if (!template) {
          return res.status(404).json({ message: "Payment plan template not found" });
        }
        res.json(template);
      } catch (error) {
        console.error("Error fetching payment plan template:", error);
        res.status(500).json({ message: "Failed to fetch payment plan template" });
      }
    },
  );

  app.post(
    "/api/payment-plan-templates",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);

        // Validate request body with Zod schema
        const validationResult = paymentPlanTemplateInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({ 
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { name, description, milestones, isDefault } = validationResult.data;

        // If setting as default, clear other defaults first
        if (isDefault) {
          const existingDefault = await storage.getDefaultPaymentPlanTemplate(companyId!);
          if (existingDefault) {
            await storage.updatePaymentPlanTemplate(companyId!, existingDefault.id, { isDefault: false });
          }
        }

        const template = await storage.createPaymentPlanTemplate({
          companyId: companyId!,
          name,
          description,
          milestones,
          isDefault: isDefault || false,
          isActive: true,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "payment_plan_template.created",
          entityType: "payment_plan_template",
          entityId: template.id,
          newState: { name, milestones, isDefault },
        });

        res.status(201).json(template);
      } catch (error) {
        console.error("Error creating payment plan template:", error);
        res.status(500).json({ message: "Failed to create payment plan template" });
      }
    },
  );

  app.patch(
    "/api/payment-plan-templates/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);

        const existing = await storage.getPaymentPlanTemplate(companyId!, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Payment plan template not found" });
        }

        // Validate partial updates with inline schema that preserves milestone validation
        const updateSchema = z.object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().max(500).optional(),
          milestones: z.array(milestoneSchema).min(1, "At least one milestone is required").optional(),
          isDefault: z.boolean().optional(),
          isActive: z.boolean().optional(),
        }).refine(
          (data) => {
            if (!data.milestones) return true;
            const names = data.milestones.map((m) => m.name.toLowerCase().trim());
            return new Set(names).size === names.length;
          },
          { message: "Milestone names must be unique", path: ["milestones"] }
        ).refine(
          (data) => {
            if (!data.milestones) return true;
            const percentMilestones = data.milestones.filter((m) => m.type === "percent");
            if (percentMilestones.length === data.milestones.length) {
              const totalPercent = percentMilestones.reduce((sum, m) => sum + m.value, 0);
              return totalPercent <= 100;
            }
            return true;
          },
          { message: "Total percentage across all milestones cannot exceed 100%", path: ["milestones"] }
        );
        const validationResult = updateSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({ 
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { name, description, milestones, isActive } = validationResult.data;

        const template = await storage.updatePaymentPlanTemplate(companyId!, req.params.id, {
          name,
          description,
          milestones,
          isActive,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "payment_plan_template.updated",
          entityType: "payment_plan_template",
          entityId: req.params.id,
          previousState: { name: existing.name, isActive: existing.isActive },
          newState: { name, isActive },
        });

        res.json(template);
      } catch (error) {
        console.error("Error updating payment plan template:", error);
        res.status(500).json({ message: "Failed to update payment plan template" });
      }
    },
  );

  app.post(
    "/api/payment-plan-templates/:id/set-default",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);

        const template = await storage.getPaymentPlanTemplate(companyId!, req.params.id);
        if (!template) {
          return res.status(404).json({ message: "Payment plan template not found" });
        }

        await storage.setDefaultPaymentPlanTemplate(companyId!, req.params.id);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "payment_plan_template.set_default",
          entityType: "payment_plan_template",
          entityId: req.params.id,
          newState: { name: template.name },
        });

        res.json({ success: true, message: `${template.name} is now the default template` });
      } catch (error) {
        console.error("Error setting default payment plan template:", error);
        res.status(500).json({ message: "Failed to set default template" });
      }
    },
  );

  // ============================================================================
  // JOB ROUTES (CORE OS STUB FOR BILLING/SCHEDULING)
  // ============================================================================
  app.get(
    "/api/jobs",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }
        const jobs = await storage.getJobs(companyId);
        res.json(jobs);
      } catch (error) {
        console.error("Error fetching jobs:", error);
        res.status(500).json({ message: "Failed to fetch jobs" });
      }
    },
  );

  app.get(
    "/api/jobs/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }
        const job = await storage.getJob(companyId, req.params.id);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }
        res.json(job);
      } catch (error) {
        console.error("Error fetching job:", error);
        res.status(500).json({ message: "Failed to fetch job" });
      }
    },
  );

  app.post(
    "/api/jobs",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        // Validate request body with Zod schema
        const validationResult = createJobInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { customerId, propertyId, estimateId, title, description, notes, scheduledDate } = validationResult.data;

        const job = await storage.createJob({
          companyId,
          customerId,
          propertyId: propertyId || null,
          estimateId: estimateId || null,
          status: "pending",
          title: title || null,
          description: description || null,
          notes: notes || null,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
          createdBy: userId,
        });

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "job.created",
          entityType: "job",
          entityId: job.id,
          newState: { status: "pending", customerId },
        });

        res.status(201).json(job);
      } catch (error) {
        console.error("Error creating job:", error);
        res.status(500).json({ message: "Failed to create job" });
      }
    },
  );

  app.patch(
    "/api/jobs/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getJob(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Job not found" });
        }

        // Jobs in terminal states cannot be modified via PATCH
        if (existing.status === "closed" || existing.status === "cancelled") {
          return res.status(409).json({
            message: `Cannot modify job in '${existing.status}' status`,
          });
        }

        // Validate request body with Zod schema (prevents direct closed/cancelled status)
        const validationResult = updateJobInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { status, title, description, notes, scheduledDate } = validationResult.data;

        // Enforce deposit gating when scheduling
        if (status === "scheduled" && existing.status !== "scheduled") {
          const schedulingCheck = await enforceSchedulingGate(companyId, req.params.id, status);
          if (!schedulingCheck.allowed) {
            return res.status(409).json({
              message: "Cannot schedule job",
              reason: schedulingCheck.reason,
            });
          }
        }

        // Build update payload, only including defined fields
        const updatePayload: Record<string, any> = {};
        if (status !== undefined) updatePayload.status = status;
        if (title !== undefined) updatePayload.title = title;
        if (description !== undefined) updatePayload.description = description;
        if (notes !== undefined) updatePayload.notes = notes;
        if (scheduledDate !== undefined) {
          updatePayload.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
        }
        // Auto-set completedAt when transitioning to completed
        if (status === "completed" && existing.status !== "completed") {
          updatePayload.completedAt = new Date();
        }

        const job = await storage.updateJob(companyId, req.params.id, updatePayload);
        
        if (!job) {
          return res.status(500).json({ message: "Failed to update job" });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "job.updated",
          entityType: "job",
          entityId: req.params.id,
          previousState: { status: existing.status },
          newState: { status: job.status },
        });

        res.json(job);
      } catch (error) {
        console.error("Error updating job:", error);
        res.status(500).json({ message: "Failed to update job" });
      }
    },
  );

  app.post(
    "/api/jobs/:id/close",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const job = await storage.getJob(companyId, req.params.id);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }

        if (job.status === "closed") {
          return res.status(409).json({ message: "Job is already closed" });
        }

        const closeCheck = await checkJobCloseOut(companyId, req.params.id);
        if (!closeCheck.canClose) {
          return res.status(409).json({ 
            message: "Cannot close job", 
            reason: closeCheck.reason,
            unpaidInvoices: closeCheck.unpaidInvoices,
            totalOutstanding: closeCheck.totalOutstanding,
          });
        }

        const closedJob = await storage.updateJob(companyId, req.params.id, {
          status: "closed",
          closedAt: new Date(),
        });

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "job.closed",
          entityType: "job",
          entityId: req.params.id,
          previousState: { status: job.status },
          newState: { status: "closed" },
        });

        res.json(closedJob);
      } catch (error) {
        console.error("Error closing job:", error);
        res.status(500).json({ message: "Failed to close job" });
      }
    },
  );

  app.get(
    "/api/jobs/:id/can-close",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const job = await storage.getJob(companyId, req.params.id);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }

        const closeCheck = await storage.canCloseJob(companyId, req.params.id);
        res.json(closeCheck);
      } catch (error) {
        console.error("Error checking job close status:", error);
        res.status(500).json({ message: "Failed to check job close status" });
      }
    },
  );

  // ============================================================================
  // CREW ROUTES (SCHEDULING)
  // ============================================================================
  app.get(
    "/api/crews",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }
        const crewList = await storage.getCrews(companyId);
        res.json(crewList);
      } catch (error) {
        console.error("Error fetching crews:", error);
        res.status(500).json({ message: "Failed to fetch crews" });
      }
    },
  );

  app.get(
    "/api/crews/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }
        const crew = await storage.getCrew(companyId, req.params.id);
        if (!crew) {
          return res.status(404).json({ message: "Crew not found" });
        }
        res.json(crew);
      } catch (error) {
        console.error("Error fetching crew:", error);
        res.status(500).json({ message: "Failed to fetch crew" });
      }
    },
  );

  app.post(
    "/api/crews",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const validationResult = createCrewInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { name, description, color } = validationResult.data;

        const crew = await storage.createCrew({
          companyId,
          name: name.trim(),
          description: description ?? null,
          color: color ?? "#3B82F6",
          isActive: true,
        });

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "crew.created",
          entityType: "crew",
          entityId: crew.id,
          newState: { name: crew.name },
        });

        res.status(201).json(crew);
      } catch (error) {
        console.error("Error creating crew:", error);
        res.status(500).json({ message: "Failed to create crew" });
      }
    },
  );

  app.patch(
    "/api/crews/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getCrew(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Crew not found" });
        }

        const validationResult = updateCrewInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { name, description, color, isActive } = validationResult.data;

        // Build update payload only with defined fields
        const updatePayload: Record<string, any> = {};
        if (name !== undefined) updatePayload.name = name.trim();
        if (description !== undefined) updatePayload.description = description;
        if (color !== undefined) updatePayload.color = color;
        if (isActive !== undefined) updatePayload.isActive = isActive;

        const crew = await storage.updateCrew(companyId, req.params.id, updatePayload);

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "crew.updated",
          entityType: "crew",
          entityId: req.params.id,
          previousState: { name: existing.name, isActive: existing.isActive },
          newState: { name: crew?.name, isActive: crew?.isActive },
        });

        res.json(crew);
      } catch (error) {
        console.error("Error updating crew:", error);
        res.status(500).json({ message: "Failed to update crew" });
      }
    },
  );

  app.delete(
    "/api/crews/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getCrew(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Crew not found" });
        }

        const deleted = await storage.deleteCrew(companyId, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete crew" });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "crew.deleted",
          entityType: "crew",
          entityId: req.params.id,
          previousState: { name: existing.name },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting crew:", error);
        res.status(500).json({ message: "Failed to delete crew" });
      }
    },
  );

  // Crew members endpoints
  app.get(
    "/api/crews/:id/members",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const crew = await storage.getCrew(companyId, req.params.id);
        if (!crew) {
          return res.status(404).json({ message: "Crew not found" });
        }

        const members = await storage.getCrewMembers(req.params.id);
        res.json(members);
      } catch (error) {
        console.error("Error fetching crew members:", error);
        res.status(500).json({ message: "Failed to fetch crew members" });
      }
    },
  );

  app.post(
    "/api/crews/:id/members",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: actorId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const crew = await storage.getCrew(companyId, req.params.id);
        if (!crew) {
          return res.status(404).json({ message: "Crew not found" });
        }

        const { userId, role, isLead } = req.body;
        if (!userId) {
          return res.status(400).json({ message: "User ID is required" });
        }

        const member = await storage.addCrewMember({
          crewId: req.params.id,
          userId,
          role: role || "member",
          isLead: isLead || false,
        });

        await storage.createAuditLogEntry({
          companyId,
          userId: actorId,
          action: "crew_member.added",
          entityType: "crew_member",
          entityId: member.id,
          newState: { crewId: req.params.id, userId, role },
        });

        res.status(201).json(member);
      } catch (error) {
        console.error("Error adding crew member:", error);
        res.status(500).json({ message: "Failed to add crew member" });
      }
    },
  );

  app.delete(
    "/api/crews/:crewId/members/:userId",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: actorId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const crew = await storage.getCrew(companyId, req.params.crewId);
        if (!crew) {
          return res.status(404).json({ message: "Crew not found" });
        }

        const removed = await storage.removeCrewMember(req.params.crewId, req.params.userId);
        if (!removed) {
          return res.status(404).json({ message: "Crew member not found" });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId: actorId,
          action: "crew_member.removed",
          entityType: "crew_member",
          entityId: `${req.params.crewId}-${req.params.userId}`,
          previousState: { crewId: req.params.crewId, userId: req.params.userId },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing crew member:", error);
        res.status(500).json({ message: "Failed to remove crew member" });
      }
    },
  );

  // ============================================================================
  // EQUIPMENT ROUTES (SCHEDULING)
  // ============================================================================
  app.get(
    "/api/equipment",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }
        const equipmentList = await storage.getEquipment(companyId);
        res.json(equipmentList);
      } catch (error) {
        console.error("Error fetching equipment:", error);
        res.status(500).json({ message: "Failed to fetch equipment" });
      }
    },
  );

  app.get(
    "/api/equipment/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }
        const item = await storage.getEquipmentItem(companyId, req.params.id);
        if (!item) {
          return res.status(404).json({ message: "Equipment not found" });
        }
        res.json(item);
      } catch (error) {
        console.error("Error fetching equipment:", error);
        res.status(500).json({ message: "Failed to fetch equipment" });
      }
    },
  );

  app.post(
    "/api/equipment",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const validationResult = createEquipmentInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { name, type, description, serialNumber, status } = validationResult.data;

        const item = await storage.createEquipment({
          companyId,
          name: name.trim(),
          type: type ?? null,
          description: description ?? null,
          serialNumber: serialNumber ?? null,
          status: status ?? "available",
          isActive: true,
        });

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "equipment.created",
          entityType: "equipment",
          entityId: item.id,
          newState: { name: item.name, type: item.type },
        });

        res.status(201).json(item);
      } catch (error) {
        console.error("Error creating equipment:", error);
        res.status(500).json({ message: "Failed to create equipment" });
      }
    },
  );

  app.patch(
    "/api/equipment/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getEquipmentItem(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Equipment not found" });
        }

        const validationResult = updateEquipmentInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { name, type, description, serialNumber, status, isActive, notes } = validationResult.data;

        // Build update payload only with defined fields
        const updatePayload: Record<string, any> = {};
        if (name !== undefined) updatePayload.name = name.trim();
        if (type !== undefined) updatePayload.type = type;
        if (description !== undefined) updatePayload.description = description;
        if (serialNumber !== undefined) updatePayload.serialNumber = serialNumber;
        if (status !== undefined) updatePayload.status = status;
        if (isActive !== undefined) updatePayload.isActive = isActive;
        if (notes !== undefined) updatePayload.notes = notes;

        const item = await storage.updateEquipment(companyId, req.params.id, updatePayload);

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "equipment.updated",
          entityType: "equipment",
          entityId: req.params.id,
          previousState: { name: existing.name, status: existing.status },
          newState: { name: item?.name, status: item?.status },
        });

        res.json(item);
      } catch (error) {
        console.error("Error updating equipment:", error);
        res.status(500).json({ message: "Failed to update equipment" });
      }
    },
  );

  app.delete(
    "/api/equipment/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getEquipmentItem(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Equipment not found" });
        }

        const deleted = await storage.deleteEquipment(companyId, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete equipment" });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "equipment.deleted",
          entityType: "equipment",
          entityId: req.params.id,
          previousState: { name: existing.name },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting equipment:", error);
        res.status(500).json({ message: "Failed to delete equipment" });
      }
    },
  );

  // ============================================================================
  // CREW ASSIGNMENTS (SCHEDULING)
  // ============================================================================
  app.get(
    "/api/crew-assignments",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const filterValidation = schedulingQueryFiltersSchema.safeParse(req.query);
        if (!filterValidation.success) {
          return res.status(400).json({
            message: "Invalid query parameters",
            errors: filterValidation.error.flatten().fieldErrors,
          });
        }

        const { jobId, crewId, date, startDate, endDate } = filterValidation.data;
        const filters: { jobId?: string; crewId?: string; date?: Date; startDate?: Date; endDate?: Date } = {};
        
        if (jobId) filters.jobId = jobId;
        if (crewId) filters.crewId = crewId;
        if (date) filters.date = date;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        const assignments = await storage.getCrewAssignments(companyId, filters);
        res.json(assignments);
      } catch (error) {
        console.error("Error fetching crew assignments:", error);
        res.status(500).json({ message: "Failed to fetch crew assignments" });
      }
    },
  );

  app.get(
    "/api/crew-assignments/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const assignment = await storage.getCrewAssignment(companyId, req.params.id);
        if (!assignment) {
          return res.status(404).json({ message: "Crew assignment not found" });
        }

        res.json(assignment);
      } catch (error) {
        console.error("Error fetching crew assignment:", error);
        res.status(500).json({ message: "Failed to fetch crew assignment" });
      }
    },
  );

  app.post(
    "/api/crew-assignments",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const validationResult = createCrewAssignmentInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { jobId, crewId, scheduledDate, startTime, endTime, notes, overrideReason } = validationResult.data;

        // Verify job exists and belongs to company
        const job = await storage.getJob(companyId, jobId);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }

        // Check deposit gating - job must have a sent/paid invoice before scheduling
        const scheduleCheck = await storage.canScheduleJob(companyId, jobId);
        if (!scheduleCheck.canSchedule) {
          return res.status(400).json({ 
            message: scheduleCheck.reason || "Job cannot be scheduled",
            code: "DEPOSIT_REQUIRED",
          });
        }

        // Verify crew exists and belongs to company
        const crew = await storage.getCrew(companyId, crewId);
        if (!crew) {
          return res.status(404).json({ message: "Crew not found" });
        }

        // Check for scheduling conflicts (skip if override provided)
        // Uses company timezone for accurate cross-midnight conflict detection
        let isOverridden = false;
        if (!overrideReason) {
          const conflictResult = await conflictDetectionService.checkCrewConflictWithCompanyTimezone({
            companyId,
            crewId,
            scheduledDate,
            startTime,
            endTime,
          });
          if (conflictResult.hasConflict) {
            return res.status(409).json({
              message: conflictResult.message,
              conflictingAssignments: conflictResult.conflictingAssignments,
            });
          }
        } else {
          isOverridden = true;
        }

        const assignment = await storage.createCrewAssignment({
          companyId,
          jobId,
          crewId,
          scheduledDate,
          startTime: startTime ?? null,
          endTime: endTime ?? null,
          notes: notes ?? null,
          isOverridden,
          overrideReason: overrideReason ?? null,
          createdBy: userId,
        });

        // Log override usage if applicable
        if (isOverridden) {
          await storage.createAuditLogEntry({
            companyId,
            userId,
            action: "schedule_override.used",
            entityType: "crew_assignment",
            entityId: assignment.id,
            newState: { jobId, crewId, scheduledDate, overrideReason },
          });
        }

        // Transition job to 'scheduled' if it's currently 'pending'
        if (job.status === "pending") {
          // Enforce deposit gating before scheduling
          const schedulingCheck = await enforceSchedulingGate(companyId, jobId, "scheduled");
          if (!schedulingCheck.allowed) {
            return res.status(409).json({
              message: "Cannot schedule job",
              reason: schedulingCheck.reason,
            });
          }

          await storage.updateJob(companyId, jobId, { 
            status: "scheduled",
            scheduledDate: scheduledDate,
          });
          await storage.createAuditLogEntry({
            companyId,
            userId,
            action: "job.status_changed",
            entityType: "job",
            entityId: jobId,
            previousState: { status: "pending" },
            newState: { status: "scheduled", scheduledDate },
          });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "crew_assignment.created",
          entityType: "crew_assignment",
          entityId: assignment.id,
          newState: { jobId, crewId, scheduledDate, isOverridden },
        });

        res.status(201).json(assignment);
      } catch (error) {
        console.error("Error creating crew assignment:", error);
        res.status(500).json({ message: "Failed to create crew assignment" });
      }
    },
  );

  app.patch(
    "/api/crew-assignments/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getCrewAssignment(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Crew assignment not found" });
        }

        const validationResult = updateCrewAssignmentInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { scheduledDate, startTime, endTime, notes, jobId, crewId } = validationResult.data;

        // Verify job if changing
        if (jobId && jobId !== existing.jobId) {
          const job = await storage.getJob(companyId, jobId);
          if (!job) {
            return res.status(404).json({ message: "Job not found" });
          }
        }

        // Verify crew if changing
        if (crewId && crewId !== existing.crewId) {
          const crew = await storage.getCrew(companyId, crewId);
          if (!crew) {
            return res.status(404).json({ message: "Crew not found" });
          }
        }

        // Check for scheduling conflicts (exclude current assignment)
        // Uses company timezone for accurate cross-midnight conflict detection
        const checkCrewId = crewId ?? existing.crewId;
        const checkDate = scheduledDate ?? existing.scheduledDate;
        const checkStartTime = startTime !== undefined ? startTime : existing.startTime;
        const checkEndTime = endTime !== undefined ? endTime : existing.endTime;
        
        const conflictResult = await conflictDetectionService.checkCrewConflictWithCompanyTimezone({
          companyId,
          crewId: checkCrewId,
          scheduledDate: checkDate,
          startTime: checkStartTime,
          endTime: checkEndTime,
          excludeAssignmentId: req.params.id,
        });
        if (conflictResult.hasConflict) {
          return res.status(409).json({
            message: conflictResult.message,
            conflictingAssignments: conflictResult.conflictingAssignments,
          });
        }

        const updatePayload: Record<string, any> = {};
        if (jobId !== undefined) updatePayload.jobId = jobId;
        if (crewId !== undefined) updatePayload.crewId = crewId;
        if (scheduledDate !== undefined) updatePayload.scheduledDate = scheduledDate;
        if (startTime !== undefined) updatePayload.startTime = startTime;
        if (endTime !== undefined) updatePayload.endTime = endTime;
        if (notes !== undefined) updatePayload.notes = notes;

        const assignment = await storage.updateCrewAssignment(companyId, req.params.id, updatePayload);

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "crew_assignment.updated",
          entityType: "crew_assignment",
          entityId: req.params.id,
          previousState: { jobId: existing.jobId, crewId: existing.crewId, scheduledDate: existing.scheduledDate },
          newState: { jobId: assignment?.jobId, crewId: assignment?.crewId, scheduledDate: assignment?.scheduledDate },
        });

        res.json(assignment);
      } catch (error) {
        console.error("Error updating crew assignment:", error);
        res.status(500).json({ message: "Failed to update crew assignment" });
      }
    },
  );

  app.delete(
    "/api/crew-assignments/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getCrewAssignment(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Crew assignment not found" });
        }

        const jobId = existing.jobId;
        
        const deleted = await storage.deleteCrewAssignment(companyId, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete crew assignment" });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "crew_assignment.deleted",
          entityType: "crew_assignment",
          entityId: req.params.id,
          previousState: { jobId: existing.jobId, crewId: existing.crewId },
        });

        // Check if this was the last crew assignment for the job
        // If so, revert job status from "scheduled" to "pending"
        const remainingAssignments = await storage.getCrewAssignments(companyId, { jobId });
        if (remainingAssignments.length === 0) {
          const job = await storage.getJob(companyId, jobId);
          if (job && job.status === "scheduled") {
            await storage.updateJob(companyId, jobId, { 
              status: "pending",
              scheduledDate: null,
            });
            await storage.createAuditLogEntry({
              companyId,
              userId,
              action: "job.unscheduled",
              entityType: "job",
              entityId: jobId,
              previousState: { status: "scheduled" },
              newState: { status: "pending" },
            });
          }
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting crew assignment:", error);
        res.status(500).json({ message: "Failed to delete crew assignment" });
      }
    },
  );

  // Conflict check endpoint for crew assignments (preview conflicts without creating)
  app.post(
    "/api/crew-assignments/check-conflicts",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const validationResult = conflictCheckCrewAssignmentSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { crewId, scheduledDate, startTime, endTime, excludeAssignmentId } = validationResult.data;

        // Uses company timezone for accurate cross-midnight conflict detection
        const conflictResult = await conflictDetectionService.checkCrewConflictWithCompanyTimezone({
          companyId,
          crewId,
          scheduledDate,
          startTime,
          endTime,
          excludeAssignmentId,
        });

        res.json(conflictResult);
      } catch (error) {
        console.error("Error checking crew assignment conflicts:", error);
        res.status(500).json({ message: "Failed to check conflicts" });
      }
    },
  );

  // ============================================================================
  // EQUIPMENT RESERVATIONS (SCHEDULING)
  // ============================================================================
  app.get(
    "/api/equipment-reservations",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const filterValidation = schedulingQueryFiltersSchema.safeParse(req.query);
        if (!filterValidation.success) {
          return res.status(400).json({
            message: "Invalid query parameters",
            errors: filterValidation.error.flatten().fieldErrors,
          });
        }

        const { jobId, equipmentId, date, startDate, endDate } = filterValidation.data;
        const filters: { jobId?: string; equipmentId?: string; date?: Date; startDate?: Date; endDate?: Date } = {};
        
        if (jobId) filters.jobId = jobId;
        if (equipmentId) filters.equipmentId = equipmentId;
        if (date) filters.date = date;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        const reservations = await storage.getEquipmentReservations(companyId, filters);
        res.json(reservations);
      } catch (error) {
        console.error("Error fetching equipment reservations:", error);
        res.status(500).json({ message: "Failed to fetch equipment reservations" });
      }
    },
  );

  app.get(
    "/api/equipment-reservations/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const reservation = await storage.getEquipmentReservation(companyId, req.params.id);
        if (!reservation) {
          return res.status(404).json({ message: "Equipment reservation not found" });
        }

        res.json(reservation);
      } catch (error) {
        console.error("Error fetching equipment reservation:", error);
        res.status(500).json({ message: "Failed to fetch equipment reservation" });
      }
    },
  );

  app.post(
    "/api/equipment-reservations",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const validationResult = createEquipmentReservationInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { jobId, equipmentId, scheduledDate, startTime, endTime, notes, overrideReason } = validationResult.data;

        // Verify job exists and belongs to company
        const job = await storage.getJob(companyId, jobId);
        if (!job) {
          return res.status(404).json({ message: "Job not found" });
        }

        // Check deposit gating - job must have a sent/paid invoice before scheduling
        const scheduleCheck = await storage.canScheduleJob(companyId, jobId);
        if (!scheduleCheck.canSchedule) {
          return res.status(400).json({ 
            message: scheduleCheck.reason || "Job cannot be scheduled",
            code: "DEPOSIT_REQUIRED",
          });
        }

        // Verify equipment exists and belongs to company
        const equipmentItem = await storage.getEquipmentItem(companyId, equipmentId);
        if (!equipmentItem) {
          return res.status(404).json({ message: "Equipment not found" });
        }

        // Check for scheduling conflicts (skip if override provided)
        // Uses company timezone for accurate cross-midnight conflict detection
        let isOverridden = false;
        if (!overrideReason) {
          const conflictResult = await conflictDetectionService.checkEquipmentConflictWithCompanyTimezone({
            companyId,
            equipmentId,
            scheduledDate,
            startTime,
            endTime,
          });
          if (conflictResult.hasConflict) {
            return res.status(409).json({
              message: conflictResult.message,
              conflictingReservations: conflictResult.conflictingReservations,
            });
          }
        } else {
          isOverridden = true;
        }

        const reservation = await storage.createEquipmentReservation({
          companyId,
          jobId,
          equipmentId,
          scheduledDate,
          startTime: startTime ?? null,
          endTime: endTime ?? null,
          notes: notes ?? null,
          isOverridden,
          overrideReason: overrideReason ?? null,
          createdBy: userId,
        });

        // Log override usage if applicable
        if (isOverridden) {
          await storage.createAuditLogEntry({
            companyId,
            userId,
            action: "schedule_override.used",
            entityType: "equipment_reservation",
            entityId: reservation.id,
            newState: { jobId, equipmentId, scheduledDate, overrideReason },
          });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "equipment_reservation.created",
          entityType: "equipment_reservation",
          entityId: reservation.id,
          newState: { jobId, equipmentId, scheduledDate, isOverridden },
        });

        res.status(201).json(reservation);
      } catch (error) {
        console.error("Error creating equipment reservation:", error);
        res.status(500).json({ message: "Failed to create equipment reservation" });
      }
    },
  );

  app.patch(
    "/api/equipment-reservations/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getEquipmentReservation(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Equipment reservation not found" });
        }

        const validationResult = updateEquipmentReservationInputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { scheduledDate, startTime, endTime, notes, jobId, equipmentId } = validationResult.data;

        // Verify job if changing
        if (jobId && jobId !== existing.jobId) {
          const job = await storage.getJob(companyId, jobId);
          if (!job) {
            return res.status(404).json({ message: "Job not found" });
          }
        }

        // Verify equipment if changing
        if (equipmentId && equipmentId !== existing.equipmentId) {
          const equipmentItem = await storage.getEquipmentItem(companyId, equipmentId);
          if (!equipmentItem) {
            return res.status(404).json({ message: "Equipment not found" });
          }
        }

        // Check for scheduling conflicts (exclude current reservation)
        // Uses company timezone for accurate cross-midnight conflict detection
        const checkEquipmentId = equipmentId ?? existing.equipmentId;
        const checkDate = scheduledDate ?? existing.scheduledDate;
        const checkStartTime = startTime !== undefined ? startTime : existing.startTime;
        const checkEndTime = endTime !== undefined ? endTime : existing.endTime;
        
        const conflictResult = await conflictDetectionService.checkEquipmentConflictWithCompanyTimezone({
          companyId,
          equipmentId: checkEquipmentId,
          scheduledDate: checkDate,
          startTime: checkStartTime,
          endTime: checkEndTime,
          excludeReservationId: req.params.id,
        });
        if (conflictResult.hasConflict) {
          return res.status(409).json({
            message: conflictResult.message,
            conflictingReservations: conflictResult.conflictingReservations,
          });
        }

        const updatePayload: Record<string, any> = {};
        if (jobId !== undefined) updatePayload.jobId = jobId;
        if (equipmentId !== undefined) updatePayload.equipmentId = equipmentId;
        if (scheduledDate !== undefined) updatePayload.scheduledDate = scheduledDate;
        if (startTime !== undefined) updatePayload.startTime = startTime;
        if (endTime !== undefined) updatePayload.endTime = endTime;
        if (notes !== undefined) updatePayload.notes = notes;

        const reservation = await storage.updateEquipmentReservation(companyId, req.params.id, updatePayload);

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "equipment_reservation.updated",
          entityType: "equipment_reservation",
          entityId: req.params.id,
          previousState: { jobId: existing.jobId, equipmentId: existing.equipmentId, scheduledDate: existing.scheduledDate },
          newState: { jobId: reservation?.jobId, equipmentId: reservation?.equipmentId, scheduledDate: reservation?.scheduledDate },
        });

        res.json(reservation);
      } catch (error) {
        console.error("Error updating equipment reservation:", error);
        res.status(500).json({ message: "Failed to update equipment reservation" });
      }
    },
  );

  app.delete(
    "/api/equipment-reservations/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Manager"),
    async (req: any, res: Response) => {
      try {
        const { companyId, id: userId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const existing = await storage.getEquipmentReservation(companyId, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Equipment reservation not found" });
        }

        const deleted = await storage.deleteEquipmentReservation(companyId, req.params.id);
        if (!deleted) {
          return res.status(500).json({ message: "Failed to delete equipment reservation" });
        }

        await storage.createAuditLogEntry({
          companyId,
          userId,
          action: "equipment_reservation.deleted",
          entityType: "equipment_reservation",
          entityId: req.params.id,
          previousState: { jobId: existing.jobId, equipmentId: existing.equipmentId },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting equipment reservation:", error);
        res.status(500).json({ message: "Failed to delete equipment reservation" });
      }
    },
  );

  // Conflict check endpoint for equipment reservations (preview conflicts without creating)
  app.post(
    "/api/equipment-reservations/check-conflicts",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        if (!companyId) {
          return res.status(400).json({ message: "Company required" });
        }

        const validationResult = conflictCheckEquipmentReservationSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            message: "Validation error",
            errors: validationResult.error.flatten().fieldErrors,
          });
        }

        const { equipmentId, scheduledDate, startTime, endTime, excludeReservationId } = validationResult.data;

        // Uses company timezone for accurate cross-midnight conflict detection
        const conflictResult = await conflictDetectionService.checkEquipmentConflictWithCompanyTimezone({
          companyId,
          equipmentId,
          scheduledDate,
          startTime,
          endTime,
          excludeReservationId,
        });

        res.json(conflictResult);
      } catch (error) {
        console.error("Error checking equipment reservation conflicts:", error);
        res.status(500).json({ message: "Failed to check conflicts" });
      }
    },
  );

  // ============================================================================
  // PAYMENT PLAN ROUTES
  // ============================================================================

  // Get all payment plans for company
  app.get(
    "/api/payment-plans",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const plans = await storage.getPaymentPlans(companyId!);
        res.json(plans);
      } catch (error) {
        console.error("Error fetching payment plans:", error);
        res.status(500).json({ message: "Failed to fetch payment plans" });
      }
    },
  );

  // Get a single payment plan
  app.get(
    "/api/payment-plans/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const plan = await storage.getPaymentPlan(companyId!, req.params.id);
        if (!plan) {
          return res.status(404).json({ message: "Payment plan not found" });
        }
        res.json(plan);
      } catch (error) {
        console.error("Error fetching payment plan:", error);
        res.status(500).json({ message: "Failed to fetch payment plan" });
      }
    },
  );

  // Create a payment plan
  app.post(
    "/api/payment-plans",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const { customerId, jobId, estimateId, templateId, title, description, schedule, totalAmount, startDate, expectedCompletionDate } = req.body;

        if (!customerId) {
          return res.status(400).json({ message: "Customer ID is required" });
        }

        const customer = await storage.getCustomer(companyId!, customerId);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        const planNumber = await storage.generatePaymentPlanNumber(companyId!);
        const magicLinkToken = crypto.randomBytes(32).toString("hex");
        const magicLinkTokenHash = crypto.createHash("sha256").update(magicLinkToken).digest("hex");
        const magicLinkExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year expiry

        const scheduleItems: PaymentPlanScheduleItem[] = (schedule || []).map((item: any, index: number) => ({
          id: crypto.randomUUID(),
          name: item.name || `Payment ${index + 1}`,
          amount: Number(item.amount) || 0,
          dueDate: item.dueDate || null,
          status: 'pending' as const,
          paidAt: null,
          invoiceId: null,
          stripePaymentIntentId: null,
        }));

        const total = Number(totalAmount) || scheduleItems.reduce((sum, item) => sum + item.amount, 0);

        const plan = await storage.createPaymentPlan({
          companyId: companyId!,
          customerId,
          jobId: jobId || null,
          estimateId: estimateId || null,
          templateId: templateId || null,
          planNumber,
          status: 'active',
          title: title || null,
          description: description || null,
          schedule: scheduleItems,
          totalAmount: total.toFixed(2),
          amountPaid: '0.00',
          amountDue: total.toFixed(2),
          magicLinkTokenHash,
          magicLinkExpiresAt,
          startDate: startDate ? new Date(startDate) : null,
          expectedCompletionDate: expectedCompletionDate ? new Date(expectedCompletionDate) : null,
          createdBy: userId,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "payment_plan.created",
          entityType: "payment_plan",
          entityId: plan.id,
          newState: { planNumber, customerId, totalAmount: total },
        });

        res.json({ plan, magicLinkToken });
      } catch (error) {
        console.error("Error creating payment plan:", error);
        res.status(500).json({ message: "Failed to create payment plan" });
      }
    },
  );

  // Update a payment plan
  app.patch(
    "/api/payment-plans/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingPlan = await storage.getPaymentPlan(companyId!, req.params.id);
        if (!existingPlan) {
          return res.status(404).json({ message: "Payment plan not found" });
        }

        if (existingPlan.status === 'completed' || existingPlan.status === 'cancelled') {
          return res.status(409).json({ message: `Cannot modify payment plan with status "${existingPlan.status}"` });
        }

        const { title, description, schedule, status, expectedCompletionDate } = req.body;

        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (schedule !== undefined) updateData.schedule = schedule;
        if (status !== undefined) updateData.status = status;
        if (expectedCompletionDate !== undefined) updateData.expectedCompletionDate = new Date(expectedCompletionDate);

        const plan = await storage.updatePaymentPlan(companyId!, req.params.id, updateData);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "payment_plan.updated",
          entityType: "payment_plan",
          entityId: req.params.id,
          previousState: { status: existingPlan.status },
          newState: updateData,
        });

        res.json(plan);
      } catch (error) {
        console.error("Error updating payment plan:", error);
        res.status(500).json({ message: "Failed to update payment plan" });
      }
    },
  );

  // Send payment plan magic link
  app.post(
    "/api/payment-plans/:id/send",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const plan = await storage.getPaymentPlan(companyId!, req.params.id);
        if (!plan) {
          return res.status(404).json({ message: "Payment plan not found" });
        }

        const customer = await storage.getCustomer(companyId!, plan.customerId);
        if (!customer) {
          return res.status(404).json({ message: "Customer not found" });
        }

        // Generate new token if needed
        let magicLinkToken = req.body.magicLinkToken;
        if (!magicLinkToken) {
          magicLinkToken = crypto.randomBytes(32).toString("hex");
          const magicLinkTokenHash = crypto.createHash("sha256").update(magicLinkToken).digest("hex");
          const magicLinkExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

          await storage.updatePaymentPlan(companyId!, plan.id, {
            magicLinkTokenHash,
            magicLinkExpiresAt,
            sentAt: new Date(),
          });
        } else {
          await storage.updatePaymentPlan(companyId!, plan.id, {
            sentAt: new Date(),
          });
        }

        const baseUrl = process.env.REPLIT_DEV_DOMAIN
          ? `https://${process.env.REPLIT_DEV_DOMAIN}`
          : process.env.BASE_URL || 'http://localhost:5000';
        const magicLinkUrl = `${baseUrl}/payment-plan/${magicLinkToken}`;

        const deliveryMethod = req.body.deliveryMethod || 'email';
        const company = await storage.getCompany(companyId!);
        let smsResult = null;

        if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && customer.phone) {
          smsResult = await sendPaymentPlanSMS({
            to: customer.phone,
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            companyName: company?.name || 'Your tree service company',
            totalAmount: plan.totalAmount,
            amountDue: plan.amountDue,
            magicLinkUrl,
          });
        }

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "payment_plan.sent",
          entityType: "payment_plan",
          entityId: plan.id,
          newState: { 
            customerEmail: customer.email, 
            customerPhone: customer.phone,
            deliveryMethod,
            smsSuccess: smsResult?.success,
          },
        });

        res.json({ 
          success: true, 
          magicLinkUrl, 
          magicLinkToken,
          smsResult,
        });
      } catch (error) {
        console.error("Error sending payment plan:", error);
        res.status(500).json({ message: "Failed to send payment plan" });
      }
    },
  );

  // ============================================================================
  // PAYMENT PLAN PORTAL ROUTES (PUBLIC - NO AUTH)
  // ============================================================================

  // Get payment plan by magic link token
  app.get("/api/portal/payment-plans/:token", async (req: any, res: Response) => {
    try {
      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const plan = await storage.getPaymentPlanByTokenHash(tokenHash);
      if (!plan) {
        return res.status(404).json({ message: "Payment plan not found or expired" });
      }

      if (plan.magicLinkExpiresAt && new Date() > plan.magicLinkExpiresAt) {
        return res.status(410).json({ message: "This payment plan link has expired" });
      }

      // Update last accessed timestamp
      await storage.updatePaymentPlanLastAccessed(plan.id);

      // Get customer and company info
      const customer = await storage.getCustomer(plan.companyId, plan.customerId);
      const company = await storage.getCompany(plan.companyId);

      // Get service requests for this plan
      const serviceReqs = await storage.getServiceRequestsByPaymentPlanId(plan.id);

      res.json({
        plan: {
          id: plan.id,
          planNumber: plan.planNumber,
          status: plan.status,
          title: plan.title,
          description: plan.description,
          schedule: plan.schedule,
          totalAmount: plan.totalAmount,
          amountPaid: plan.amountPaid,
          amountDue: plan.amountDue,
          startDate: plan.startDate,
          expectedCompletionDate: plan.expectedCompletionDate,
        },
        customer: customer ? {
          name: `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email,
        } : null,
        company: company ? {
          name: company.name,
          phone: company.primaryPhone,
          email: company.primaryEmail,
        } : null,
        serviceRequests: serviceReqs.map(sr => ({
          id: sr.id,
          requestNumber: sr.requestNumber,
          category: sr.category,
          status: sr.status,
          title: sr.title,
          createdAt: sr.createdAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching payment plan portal:", error);
      res.status(500).json({ message: "Failed to fetch payment plan" });
    }
  });

  // Create Stripe checkout session for payment plan installment
  app.post("/api/portal/payment-plans/:token/pay", async (req: any, res: Response) => {
    try {
      const { token } = req.params;
      const { scheduleItemId } = req.body;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const plan = await storage.getPaymentPlanByTokenHash(tokenHash);
      if (!plan) {
        return res.status(404).json({ message: "Payment plan not found or expired" });
      }

      if (plan.magicLinkExpiresAt && new Date() > plan.magicLinkExpiresAt) {
        return res.status(410).json({ message: "This payment plan link has expired" });
      }

      if (plan.status === 'completed' || plan.status === 'cancelled') {
        return res.status(409).json({ message: `Cannot pay for ${plan.status} payment plan` });
      }

      const schedule = plan.schedule as PaymentPlanScheduleItem[];
      const scheduleItem = scheduleItemId
        ? schedule.find(item => item.id === scheduleItemId)
        : schedule.find(item => ['pending', 'due', 'overdue'].includes(item.status));

      if (!scheduleItem) {
        return res.status(404).json({ message: "No pending payment found" });
      }

      if (scheduleItem.status === 'paid') {
        return res.status(409).json({ message: "This payment has already been made" });
      }

      const customer = await storage.getCustomer(plan.companyId, plan.customerId);
      const company = await storage.getCompany(plan.companyId);

      const { getStripe } = await import("./stripeClient");
      const stripe = getStripe();

      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "http://localhost:5000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `${scheduleItem.name} - ${plan.planNumber}`,
              description: plan.title || `Payment Plan ${plan.planNumber}`,
            },
            unit_amount: Math.round(scheduleItem.amount * 100),
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/payment-plan/${token}?payment=success&item=${scheduleItem.id}`,
        cancel_url: `${baseUrl}/payment-plan/${token}?payment=cancelled`,
        customer_email: customer?.email || undefined,
        metadata: {
          paymentPlanId: plan.id,
          planNumber: plan.planNumber,
          scheduleItemId: scheduleItem.id,
          companyId: plan.companyId,
          type: "payment_plan_installment",
        },
      });

      await storage.createAuditLogEntry({
        companyId: plan.companyId,
        action: "payment_plan.checkout_created",
        entityType: "payment_plan",
        entityId: plan.id,
        newState: { 
          scheduleItemId: scheduleItem.id,
          amount: scheduleItem.amount,
          checkoutSessionId: session.id,
        },
      });

      res.json({
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Error creating payment checkout:", error);
      res.status(500).json({ message: "Failed to create payment checkout" });
    }
  });

  // Submit service request from portal (upsell)
  app.post("/api/portal/payment-plans/:token/service-request", async (req: any, res: Response) => {
    try {
      const { token } = req.params;
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const clientIp = req.ip || req.connection?.remoteAddress || "unknown";

      const plan = await storage.getPaymentPlanByTokenHash(tokenHash);
      if (!plan) {
        return res.status(404).json({ message: "Payment plan not found or expired" });
      }

      if (plan.magicLinkExpiresAt && new Date() > plan.magicLinkExpiresAt) {
        return res.status(410).json({ message: "This payment plan link has expired" });
      }

      const { category, title, description, preferredTimeframe, urgency, serviceAddress, useExistingAddress } = req.body;

      if (!category || !serviceRequestCategories.includes(category)) {
        return res.status(400).json({ 
          message: "Invalid service category", 
          validCategories: serviceRequestCategories 
        });
      }

      const requestNumber = await storage.generateServiceRequestNumber(plan.companyId);

      const serviceRequest = await storage.createServiceRequest({
        companyId: plan.companyId,
        customerId: plan.customerId,
        paymentPlanId: plan.id,
        requestNumber,
        category,
        status: 'submitted',
        title: title || null,
        description: description || null,
        preferredTimeframe: preferredTimeframe || null,
        urgency: urgency || 'normal',
        serviceAddress: serviceAddress || null,
        useExistingAddress: useExistingAddress ?? true,
        submittedVia: 'portal',
        submitterIpAddress: clientIp,
        submitterUserAgent: req.get("User-Agent"),
      });

      await storage.createAuditLogEntry({
        companyId: plan.companyId,
        action: "service_request.submitted_via_portal",
        entityType: "service_request",
        entityId: serviceRequest.id,
        newState: { 
          category, 
          paymentPlanId: plan.id,
          requestNumber: serviceRequest.requestNumber,
        },
        ipAddress: clientIp,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        success: true,
        serviceRequest: {
          id: serviceRequest.id,
          requestNumber: serviceRequest.requestNumber,
          category: serviceRequest.category,
          status: serviceRequest.status,
        },
      });
    } catch (error) {
      console.error("Error submitting service request:", error);
      res.status(500).json({ message: "Failed to submit service request" });
    }
  });

  // ============================================================================
  // SERVICE REQUEST ROUTES (ADMIN)
  // ============================================================================

  // Get all service requests
  app.get(
    "/api/service-requests",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const requests = await storage.getServiceRequests(companyId!);
        res.json(requests);
      } catch (error) {
        console.error("Error fetching service requests:", error);
        res.status(500).json({ message: "Failed to fetch service requests" });
      }
    },
  );

  // Get a single service request
  app.get(
    "/api/service-requests/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);
        const request = await storage.getServiceRequest(companyId!, req.params.id);
        if (!request) {
          return res.status(404).json({ message: "Service request not found" });
        }
        res.json(request);
      } catch (error) {
        console.error("Error fetching service request:", error);
        res.status(500).json({ message: "Failed to fetch service request" });
      }
    },
  );

  // Update a service request (review, convert to lead, etc.)
  app.patch(
    "/api/service-requests/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin", "Estimator"),
    async (req: any, res: Response) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existingRequest = await storage.getServiceRequest(companyId!, req.params.id);
        if (!existingRequest) {
          return res.status(404).json({ message: "Service request not found" });
        }

        const { status, internalNotes, leadId, estimateId } = req.body;

        const updateData: any = {};
        if (status !== undefined) updateData.status = status;
        if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
        if (leadId !== undefined) updateData.leadId = leadId;
        if (estimateId !== undefined) updateData.estimateId = estimateId;

        // If status is being changed to 'reviewed', set reviewedBy and reviewedAt
        if (status === 'reviewed' && existingRequest.status !== 'reviewed') {
          updateData.reviewedBy = userId;
          updateData.reviewedAt = new Date();
        }

        const request = await storage.updateServiceRequest(companyId!, req.params.id, updateData);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "service_request.updated",
          entityType: "service_request",
          entityId: req.params.id,
          previousState: { status: existingRequest.status },
          newState: updateData,
        });

        res.json(request);
      } catch (error) {
        console.error("Error updating service request:", error);
        res.status(500).json({ message: "Failed to update service request" });
      }
    },
  );

  // ============================================================================
  // AUDIT LOG ROUTES
  // ============================================================================
  app.get(
    "/api/audit-log",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: Response) => {
      try {
        const { companyId } = getAuthedUser(req);

        const limit = parseInt(req.query.limit as string) || 100;
        const log = await storage.getAuditLog(companyId!, limit);
        res.json(log);
      } catch (error) {
        console.error("Error fetching audit log:", error);
        res.status(500).json({ message: "Failed to fetch audit log" });
      }
    },
  );

  // ============================================================================
  // PRICING TOOLS ROUTES (AUTHENTICATED)
  // ============================================================================
  
  // Get all pricing tools for a company
  app.get(
    "/api/pricing-tools",
    requireAuth,
    requireCompany(),
    async (req: any, res: any) => {
      try {
        const { companyId } = getAuthedUser(req);
        const tools = await storage.getPricingTools(companyId!);
        res.json(tools);
      } catch (error) {
        console.error("Error fetching pricing tools:", error);
        res.status(500).json({ message: "Failed to fetch pricing tools" });
      }
    },
  );

  // Get a single pricing tool
  app.get(
    "/api/pricing-tools/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: any) => {
      try {
        const { companyId } = getAuthedUser(req);
        const tool = await storage.getPricingTool(companyId!, req.params.id);
        if (!tool) {
          return res.status(404).json({ message: "Pricing tool not found" });
        }
        res.json(tool);
      } catch (error) {
        console.error("Error fetching pricing tool:", error);
        res.status(500).json({ message: "Failed to fetch pricing tool" });
      }
    },
  );

  // Create a pricing tool
  app.post(
    "/api/pricing-tools",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: any) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { name, slug, description, type, config, isPublic, isActive } = req.body;

        if (!name || !slug || !config) {
          return res.status(400).json({ message: "Name, slug, and config are required" });
        }

        // Check slug uniqueness within company
        const existing = await storage.getPricingToolBySlug(companyId!, slug);
        if (existing) {
          return res.status(400).json({ message: "A pricing tool with this slug already exists" });
        }

        const tool = await storage.createPricingTool({
          companyId: companyId!,
          name,
          slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          description,
          type: type || 'public_quote',
          config,
          isPublic: isPublic ?? true,
          isActive: isActive ?? true,
          createdBy: userId,
        });

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "pricing_tool.created",
          entityType: "pricing_tool",
          entityId: tool.id,
          newState: { name: tool.name, slug: tool.slug },
        });

        res.status(201).json(tool);
      } catch (error) {
        console.error("Error creating pricing tool:", error);
        res.status(500).json({ message: "Failed to create pricing tool" });
      }
    },
  );

  // Update a pricing tool
  app.patch(
    "/api/pricing-tools/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: any) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { name, slug, description, type, config, isPublic, isActive } = req.body;

        const existing = await storage.getPricingTool(companyId!, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Pricing tool not found" });
        }

        // If changing slug, check uniqueness
        if (slug && slug !== existing.slug) {
          const slugExists = await storage.getPricingToolBySlug(companyId!, slug);
          if (slugExists) {
            return res.status(400).json({ message: "A pricing tool with this slug already exists" });
          }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (slug !== undefined) updateData.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (description !== undefined) updateData.description = description;
        if (type !== undefined) updateData.type = type;
        if (config !== undefined) updateData.config = config;
        if (isPublic !== undefined) updateData.isPublic = isPublic;
        if (isActive !== undefined) updateData.isActive = isActive;

        const tool = await storage.updatePricingTool(companyId!, req.params.id, updateData);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "pricing_tool.updated",
          entityType: "pricing_tool",
          entityId: req.params.id,
          previousState: { name: existing.name, slug: existing.slug },
          newState: updateData,
        });

        res.json(tool);
      } catch (error) {
        console.error("Error updating pricing tool:", error);
        res.status(500).json({ message: "Failed to update pricing tool" });
      }
    },
  );

  // Delete a pricing tool
  app.delete(
    "/api/pricing-tools/:id",
    requireAuth,
    requireCompany(),
    requireRole("Admin"),
    async (req: any, res: any) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);

        const existing = await storage.getPricingTool(companyId!, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Pricing tool not found" });
        }

        await storage.deletePricingTool(companyId!, req.params.id);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "pricing_tool.deleted",
          entityType: "pricing_tool",
          entityId: req.params.id,
          previousState: { name: existing.name, slug: existing.slug },
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting pricing tool:", error);
        res.status(500).json({ message: "Failed to delete pricing tool" });
      }
    },
  );

  // Get public quote requests for a company
  app.get(
    "/api/quote-requests",
    requireAuth,
    requireCompany(),
    async (req: any, res: any) => {
      try {
        const { companyId } = getAuthedUser(req);
        const requests = await storage.getPublicQuoteRequests(companyId!);
        res.json(requests);
      } catch (error) {
        console.error("Error fetching quote requests:", error);
        res.status(500).json({ message: "Failed to fetch quote requests" });
      }
    },
  );

  // Update a quote request (convert to lead, etc.)
  app.patch(
    "/api/quote-requests/:id",
    requireAuth,
    requireCompany(),
    async (req: any, res: any) => {
      try {
        const { id: userId, companyId } = getAuthedUser(req);
        const { status, leadId } = req.body;

        const existing = await storage.getPublicQuoteRequest(companyId!, req.params.id);
        if (!existing) {
          return res.status(404).json({ message: "Quote request not found" });
        }

        const updateData: any = {};
        if (status !== undefined) updateData.status = status;
        if (leadId !== undefined) {
          updateData.leadId = leadId;
          updateData.convertedAt = new Date();
          updateData.status = 'converted';
        }

        const request = await storage.updatePublicQuoteRequest(companyId!, req.params.id, updateData);

        await storage.createAuditLogEntry({
          companyId: companyId!,
          userId,
          action: "quote_request.updated",
          entityType: "public_quote_request",
          entityId: req.params.id,
          previousState: { status: existing.status },
          newState: updateData,
        });

        res.json(request);
      } catch (error) {
        console.error("Error updating quote request:", error);
        res.status(500).json({ message: "Failed to update quote request" });
      }
    },
  );

  // ============================================================================
  // PUBLIC QUOTE LANDING PAGE ROUTES (NO AUTH REQUIRED)
  // ============================================================================

  // Get marketing fields for public quote widget (uses configurable field registry)
  app.get("/api/public/quote-widget/:slug/fields", async (req: any, res: any) => {
    try {
      const { slug } = req.params;
      const toolWithCompany = await storage.getPublicPricingToolBySlug(slug);
      
      if (!toolWithCompany) {
        return res.status(404).json({ message: "Quote tool not found" });
      }

      // Get active marketing fields for this company
      const allFields = await storage.getEstimateFields(toolWithCompany.companyId);
      const marketingFields = allFields.filter((f) => f.isActive && f.appliesTo.includes('marketing'));

      res.json({
        company: {
          name: toolWithCompany.company.name,
          logoUrl: toolWithCompany.company.logoUrl,
          primaryPhone: toolWithCompany.company.primaryPhone,
        },
        fields: marketingFields.sort((a, b) => a.sortOrder - b.sortOrder),
        config: {
          name: toolWithCompany.name,
          thankYouMessage: (toolWithCompany.config as any)?.thankYouMessage || "Thanks! We'll be in touch shortly.",
        },
      });
    } catch (error) {
      console.error("Error fetching public quote widget fields:", error);
      res.status(500).json({ message: "Failed to load quote widget" });
    }
  });

  // Preview pricing for public quote widget using EstimateEngine
  app.post("/api/public/quote-widget/:slug/preview", async (req: any, res: any) => {
    try {
      const { slug } = req.params;
      const toolWithCompany = await storage.getPublicPricingToolBySlug(slug);
      
      if (!toolWithCompany) {
        return res.status(404).json({ message: "Quote tool not found" });
      }

      const { inputs, workItems } = req.body;

      // Use EstimateEngine to calculate pricing
      const { EstimateEngine } = await import("./services/estimateEngine");
      const previewResult = await EstimateEngine.preview({
        companyId: toolWithCompany.companyId,
        mode: 'marketing',
        inputs: inputs || {},
        workItems: workItems || [],
      });

      // Return a price range (±20%) for marketing purposes
      const baseTotal = previewResult.pricingSnapshot.total;
      const priceLow = Math.round(baseTotal * 0.8);
      const priceHigh = Math.round(baseTotal * 1.2);

      // Only return public-safe price range, not internal breakdown
      res.json({
        estimatedPriceLow: priceLow,
        estimatedPriceHigh: priceHigh,
      });
    } catch (error) {
      console.error("Error previewing public quote:", error);
      res.status(500).json({ message: "Failed to calculate price" });
    }
  });

  // Submit public quote with configurable fields (creates lead)
  app.post("/api/public/quote-widget/:slug/submit", async (req: any, res: any) => {
    try {
      const { slug } = req.params;
      const toolWithCompany = await storage.getPublicPricingToolBySlug(slug);
      
      if (!toolWithCompany) {
        return res.status(404).json({ message: "Quote tool not found" });
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        formData,
        workItems,
        utmSource,
        utmMedium,
        utmCampaign,
      } = req.body;

      if (!firstName) {
        return res.status(400).json({ message: "First name is required" });
      }

      // Use EstimateEngine to calculate final pricing
      const { EstimateEngine } = await import("./services/estimateEngine");
      const previewResult = await EstimateEngine.preview({
        companyId: toolWithCompany.companyId,
        mode: 'marketing',
        inputs: formData || {},
        workItems: workItems || [],
      });

      const baseTotal = previewResult.pricingSnapshot.total;
      const priceLow = Math.round(baseTotal * 0.8);
      const priceHigh = Math.round(baseTotal * 1.2);

      // Create the quote request
      const quoteRequest = await storage.createPublicQuoteRequest({
        companyId: toolWithCompany.companyId,
        pricingToolId: toolWithCompany.id,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        formData,
        photos: [],
        estimatedPriceLow: priceLow.toString(),
        estimatedPriceHigh: priceHigh.toString(),
        status: 'new',
        submitterIpAddress: req.ip,
        submitterUserAgent: req.get('user-agent'),
        utmSource,
        utmMedium,
        utmCampaign,
      });

      // Increment submission count
      await storage.incrementPricingToolSubmissionCount(toolWithCompany.id);

      // Auto-create a lead
      const lead = await storage.createLead({
        companyId: toolWithCompany.companyId,
        stage: 'new',
        source: 'public_quote',
        notes: `Public quote request from ${firstName} ${lastName || ''}\nEstimated: $${priceLow} - $${priceHigh}`,
        estimatedValue: priceHigh.toString(),
      });

      // Link the quote request to the lead
      await storage.updatePublicQuoteRequest(toolWithCompany.companyId, quoteRequest.id, {
        leadId: lead.id,
      });

      const config = toolWithCompany.config as any;
      res.status(201).json({
        success: true,
        estimatedPriceLow: priceLow,
        estimatedPriceHigh: priceHigh,
        message: config?.thankYouMessage || "Thanks! We'll be in touch shortly.",
      });
    } catch (error) {
      console.error("Error submitting public quote widget:", error);
      res.status(500).json({ message: "Failed to submit quote request" });
    }
  });

  // Get public pricing tool by slug (for landing page)
  app.get("/api/public/quote/:slug", async (req: any, res: any) => {
    try {
      const { slug } = req.params;
      const toolWithCompany = await storage.getPublicPricingToolBySlug(slug);
      
      if (!toolWithCompany) {
        return res.status(404).json({ message: "Quote tool not found" });
      }

      // Increment view count
      await storage.incrementPricingToolViewCount(toolWithCompany.id);

      // Return only public-safe data
      res.json({
        id: toolWithCompany.id,
        name: toolWithCompany.name,
        config: toolWithCompany.config,
        company: {
          name: toolWithCompany.company.name,
          logoUrl: toolWithCompany.company.logoUrl,
          primaryPhone: toolWithCompany.company.primaryPhone,
        },
      });
    } catch (error) {
      console.error("Error fetching public quote tool:", error);
      res.status(500).json({ message: "Failed to load quote tool" });
    }
  });

  // Submit a public quote request
  app.post("/api/public/quote/:slug", async (req: any, res: any) => {
    try {
      const { slug } = req.params;
      const toolWithCompany = await storage.getPublicPricingToolBySlug(slug);
      
      if (!toolWithCompany) {
        return res.status(404).json({ message: "Quote tool not found" });
      }

      const {
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        formData,
        photos,
        utmSource,
        utmMedium,
        utmCampaign,
      } = req.body;

      if (!firstName) {
        return res.status(400).json({ message: "First name is required" });
      }

      // Calculate estimated price based on form data and tool config
      const config = toolWithCompany.config as any;
      let basePrice = config.basePrice || 500;
      let multiplier = 1;

      // Apply height multiplier if configured
      if (formData?.treeHeight && config.heightMultipliers) {
        const heightKey = formData.treeHeight;
        multiplier = config.heightMultipliers[heightKey] || 1;
      }

      // Apply hazard multiplier
      if (formData?.hasHazards) {
        multiplier *= config.hazardMultiplier || 1.25;
      }

      // Apply tree count multiplier
      if (formData?.treeCount && formData.treeCount > 1) {
        multiplier *= formData.treeCount * 0.85; // Slight discount for multiple trees
      }

      // Add stump grinding if selected
      let additionalCost = 0;
      if (formData?.includeStumpGrinding) {
        additionalCost += (config.stumpGrindingAddon || 150) * (formData.treeCount || 1);
      }

      const calculatedPrice = basePrice * multiplier + additionalCost;
      const priceLow = Math.round(calculatedPrice * 0.8);
      const priceHigh = Math.round(calculatedPrice * 1.2);

      // Create the quote request
      const quoteRequest = await storage.createPublicQuoteRequest({
        companyId: toolWithCompany.companyId,
        pricingToolId: toolWithCompany.id,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        zipCode,
        formData,
        photos: photos || [],
        estimatedPriceLow: priceLow.toString(),
        estimatedPriceHigh: priceHigh.toString(),
        status: 'new',
        submitterIpAddress: req.ip,
        submitterUserAgent: req.get('user-agent'),
        utmSource,
        utmMedium,
        utmCampaign,
      });

      // Increment submission count
      await storage.incrementPricingToolSubmissionCount(toolWithCompany.id);

      // Optionally auto-create a lead
      const lead = await storage.createLead({
        companyId: toolWithCompany.companyId,
        stage: 'new',
        source: 'public_quote',
        notes: `Public quote request from ${firstName} ${lastName || ''}\nEstimated: $${priceLow} - $${priceHigh}`,
        estimatedValue: priceHigh.toString(),
      });

      // Link the quote request to the lead
      await storage.updatePublicQuoteRequest(toolWithCompany.companyId, quoteRequest.id, {
        leadId: lead.id,
      });

      // Return success with price range
      res.status(201).json({
        success: true,
        estimatedPriceLow: priceLow,
        estimatedPriceHigh: priceHigh,
        message: config.thankYouMessage || "Thanks! We'll be in touch shortly.",
      });
    } catch (error) {
      console.error("Error submitting public quote:", error);
      res.status(500).json({ message: "Failed to submit quote request" });
    }
  });

  // ============================================================================
  // LEAD SOURCES (Settings → Marketing)
  // ============================================================================
  app.get("/api/lead-sources", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const sources = await storage.getLeadSources(companyId!);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching lead sources:", error);
      res.status(500).json({ message: "Failed to fetch lead sources" });
    }
  });

  app.post("/api/lead-sources", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const { name, description, isDefault, sortOrder } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Name is required" });
      }

      const source = await storage.createLeadSource({
        companyId: companyId!,
        name: name.trim(),
        description: description || null,
        isDefault: isDefault || false,
        sortOrder: sortOrder || 0,
      });

      res.status(201).json(source);
    } catch (error) {
      console.error("Error creating lead source:", error);
      res.status(500).json({ message: "Failed to create lead source" });
    }
  });

  app.patch("/api/lead-sources/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const { name, description, isDefault, isActive, sortOrder } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (isDefault !== undefined) updateData.isDefault = isDefault;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

      const source = await storage.updateLeadSource(companyId!, req.params.id, updateData);
      if (!source) {
        return res.status(404).json({ message: "Lead source not found" });
      }

      res.json(source);
    } catch (error) {
      console.error("Error updating lead source:", error);
      res.status(500).json({ message: "Failed to update lead source" });
    }
  });

  app.delete("/api/lead-sources/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const deleted = await storage.deleteLeadSource(companyId!, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Lead source not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting lead source:", error);
      res.status(500).json({ message: "Failed to delete lead source" });
    }
  });

  // ============================================================================
  // MARKETING CAMPAIGNS
  // ============================================================================
  app.get("/api/marketing/campaigns", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const campaigns = await storage.getMarketingCampaigns(companyId!);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching marketing campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  app.post("/api/marketing/campaigns", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { id: userId, companyId } = getAuthedUser(req);
      const { name, description, platform, status, budgetAmount, startDate, endDate } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Name is required" });
      }

      const campaign = await storage.createMarketingCampaign({
        companyId: companyId!,
        name: name.trim(),
        description: description || null,
        platform: platform || null,
        status: status || "active",
        budgetAmount: budgetAmount || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        createdBy: userId,
      });

      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating marketing campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  app.patch("/api/marketing/campaigns/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const { name, description, platform, status, budgetAmount, startDate, endDate } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (platform !== undefined) updateData.platform = platform;
      if (status !== undefined) updateData.status = status;
      if (budgetAmount !== undefined) updateData.budgetAmount = budgetAmount;
      if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

      const campaign = await storage.updateMarketingCampaign(companyId!, req.params.id, updateData);
      if (!campaign) {
        return res.status(404).json({ message: "Campaign not found" });
      }

      res.json(campaign);
    } catch (error) {
      console.error("Error updating marketing campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  app.delete("/api/marketing/campaigns/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const deleted = await storage.deleteMarketingCampaign(companyId!, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Campaign not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting marketing campaign:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // ============================================================================
  // MARKETING PAGES
  // ============================================================================
  app.get("/api/marketing/pages", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const pages = await storage.getMarketingPages(companyId!);
      res.json(pages);
    } catch (error) {
      console.error("Error fetching marketing pages:", error);
      res.status(500).json({ message: "Failed to fetch pages" });
    }
  });

  app.get("/api/marketing/pages/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const page = await storage.getMarketingPage(companyId!, req.params.id);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json(page);
    } catch (error) {
      console.error("Error fetching marketing page:", error);
      res.status(500).json({ message: "Failed to fetch page" });
    }
  });

  app.post("/api/marketing/pages", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { id: userId, companyId } = getAuthedUser(req);
      const {
        campaignId,
        title,
        headline,
        description,
        ctaText,
        thankYouMessage,
        heroImageUrl,
        logoUrl,
        primaryColor,
        inputFields,
        status,
        platform,
      } = req.body;

      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ message: "Title is required" });
      }

      const magicToken = crypto.randomBytes(32).toString("hex");

      const page = await storage.createMarketingPage({
        companyId: companyId!,
        campaignId: campaignId || null,
        title: title.trim(),
        headline: headline || null,
        description: description || null,
        ctaText: ctaText || "Get Your Free Quote",
        thankYouMessage: thankYouMessage || null,
        heroImageUrl: heroImageUrl || null,
        logoUrl: logoUrl || null,
        primaryColor: primaryColor || null,
        inputFields: inputFields || [],
        magicToken,
        status: status || "draft",
        platform: platform || null,
        createdBy: userId,
      });

      res.status(201).json(page);
    } catch (error) {
      console.error("Error creating marketing page:", error);
      res.status(500).json({ message: "Failed to create page" });
    }
  });

  app.patch("/api/marketing/pages/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const {
        campaignId,
        title,
        headline,
        description,
        ctaText,
        thankYouMessage,
        heroImageUrl,
        logoUrl,
        primaryColor,
        inputFields,
        status,
        platform,
        publishedAt,
        archivedAt,
      } = req.body;

      const updateData: any = {};
      if (campaignId !== undefined) updateData.campaignId = campaignId;
      if (title !== undefined) updateData.title = title.trim();
      if (headline !== undefined) updateData.headline = headline;
      if (description !== undefined) updateData.description = description;
      if (ctaText !== undefined) updateData.ctaText = ctaText;
      if (thankYouMessage !== undefined) updateData.thankYouMessage = thankYouMessage;
      if (heroImageUrl !== undefined) updateData.heroImageUrl = heroImageUrl;
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
      if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
      if (inputFields !== undefined) updateData.inputFields = inputFields;
      if (status !== undefined) {
        updateData.status = status;
        if (status === "live" && !updateData.publishedAt) {
          updateData.publishedAt = new Date();
        }
        if (status === "archived" && !updateData.archivedAt) {
          updateData.archivedAt = new Date();
        }
      }
      if (platform !== undefined) updateData.platform = platform;
      if (publishedAt !== undefined) updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
      if (archivedAt !== undefined) updateData.archivedAt = archivedAt ? new Date(archivedAt) : null;

      const page = await storage.updateMarketingPage(companyId!, req.params.id, updateData);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      res.json(page);
    } catch (error) {
      console.error("Error updating marketing page:", error);
      res.status(500).json({ message: "Failed to update page" });
    }
  });

  app.delete("/api/marketing/pages/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const deleted = await storage.deleteMarketingPage(companyId!, req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting marketing page:", error);
      res.status(500).json({ message: "Failed to delete page" });
    }
  });

  // ============================================================================
  // PUBLIC MARKETING PAGE (No auth required)
  // ============================================================================
  app.get("/api/public/marketing/:token", async (req: any, res: any) => {
    try {
      const { token } = req.params;
      const page = await storage.getMarketingPageByToken(token);

      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      if (page.status !== "live") {
        return res.status(404).json({ message: "Page not available" });
      }

      await storage.incrementMarketingPageViewCount(page.id);

      const company = await storage.getCompany(page.companyId);

      res.json({
        id: page.id,
        title: page.title,
        headline: page.headline,
        description: page.description,
        ctaText: page.ctaText,
        thankYouMessage: page.thankYouMessage,
        heroImageUrl: page.heroImageUrl,
        logoUrl: page.logoUrl || company?.logoUrl,
        primaryColor: page.primaryColor,
        inputFields: page.inputFields,
        company: company ? {
          name: company.name,
          logoUrl: company.logoUrl,
          primaryPhone: company.primaryPhone,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching public marketing page:", error);
      res.status(500).json({ message: "Failed to load page" });
    }
  });

  app.post("/api/public/marketing/:token/submit", async (req: any, res: any) => {
    try {
      const { token } = req.params;
      const page = await storage.getMarketingPageByToken(token);

      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }

      if (page.status !== "live") {
        return res.status(404).json({ message: "Page not available" });
      }

      const {
        formData,
        firstName,
        lastName,
        email,
        phone,
        address,
        photos,
        utmSource,
        utmMedium,
        utmCampaign,
      } = req.body;

      const submission = await storage.createMarketingSubmission({
        pageId: page.id,
        companyId: page.companyId,
        formData: formData || {},
        firstName: firstName || null,
        lastName: lastName || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        photos: photos || [],
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        status: "new",
      });

      await storage.incrementMarketingPageSubmissionCount(page.id);

      const lead = await storage.createLead({
        companyId: page.companyId,
        stage: "new",
        source: page.platform || "marketing_page",
        notes: `From marketing page: ${page.title}\n${firstName || ""} ${lastName || ""}\n${email || ""}\n${phone || ""}`,
      });

      await storage.updateMarketingSubmission(page.companyId, submission.id, {
        leadId: lead.id,
        convertedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        message: page.thankYouMessage || "Thank you for your submission!",
      });
    } catch (error) {
      console.error("Error submitting to marketing page:", error);
      res.status(500).json({ message: "Failed to submit" });
    }
  });

  // ============================================================================
  // MARKETING SUBMISSIONS
  // ============================================================================
  app.get("/api/marketing/submissions", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const submissions = await storage.getMarketingSubmissions(companyId!);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching marketing submissions:", error);
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  app.patch("/api/marketing/submissions/:id", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);
      const { status, leadId } = req.body;

      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (leadId !== undefined) {
        updateData.leadId = leadId;
        updateData.convertedAt = new Date();
      }

      const submission = await storage.updateMarketingSubmission(companyId!, req.params.id, updateData);
      if (!submission) {
        return res.status(404).json({ message: "Submission not found" });
      }

      res.json(submission);
    } catch (error) {
      console.error("Error updating marketing submission:", error);
      res.status(500).json({ message: "Failed to update submission" });
    }
  });

  // ============================================================================
  // MARKETING DASHBOARD STATS
  // ============================================================================
  app.get("/api/marketing/stats", requireAuth, requireCompany(), async (req: any, res: any) => {
    try {
      const { companyId } = getAuthedUser(req);

      const campaigns = await storage.getMarketingCampaigns(companyId!);
      const activeCampaigns = campaigns.filter((c) => c.status === "active").length;

      const pages = await storage.getMarketingPages(companyId!);
      const livePages = pages.filter((p) => p.status === "live").length;

      const submissions = await storage.getMarketingSubmissions(companyId!);
      const totalSubmissions = submissions.length;
      const totalLeadsGenerated = submissions.filter((s) => s.leadId).length;

      const totalViews = pages.reduce((sum, p) => sum + (p.viewCount || 0), 0);

      res.json({
        activeCampaigns,
        livePages,
        totalSubmissions,
        totalLeadsGenerated,
        totalViews,
        conversionRate: totalViews > 0 ? ((totalSubmissions / totalViews) * 100).toFixed(1) : "0.0",
      });
    } catch (error) {
      console.error("Error fetching marketing stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
