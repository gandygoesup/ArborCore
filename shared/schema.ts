import { sql, relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  decimal,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

/* ============================
   WORK ITEM TYPES
============================ */
export const workItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unitPrice: z.number().nonnegative(),
  laborHours: z.number().nonnegative().optional(),
  equipmentIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type WorkItem = z.infer<typeof workItemSchema>;

/* ============================
   COST PROFILE TYPES
============================ */
const laborRoleSchema = z.object({
  name: z.string(),
  count: z.number().int().positive(),
  hourlyWage: z.number().positive(),
  burdenPercentage: z.number().nonnegative(),
  hoursPerDay: z.number().positive(),
});

const laborInputSchema = z.object({
  roles: z.array(laborRoleSchema),
  billableDaysPerMonth: z.number().positive(),
  utilizationPercentage: z.number().min(0).max(100),
});

const equipmentItemSchema = z.object({
  name: z.string(),
  isOwned: z.boolean().optional(),
  monthlyCost: z.number().nonnegative(),
  usableWorkdaysPerMonth: z.number().positive(),
});

const overheadInputSchema = z.object({
  insurance: z.number().nonnegative(),
  admin: z.number().nonnegative(),
  yardShop: z.number().nonnegative(),
  fuelBaseline: z.number().nonnegative(),
  marketingBaseline: z.number().nonnegative(),
  toolsConsumables: z.number().nonnegative(),
});

const marginInputSchema = z.object({
  targetMarginPercentage: z.number().min(0).max(100),
  minimumFloorPercentage: z.number().min(0).max(100),
  halfDayFactor: z.number().min(0).max(1).optional(),
  survivalModeThreshold: z.number().nonnegative(),
});

export const costProfileInputSchema = z.object({
  labor: laborInputSchema,
  equipment: z.array(equipmentItemSchema),
  overhead: overheadInputSchema,
  margin: marginInputSchema,
});
export type CostProfileInput = z.infer<typeof costProfileInputSchema>;

/* ============================
   PRICING BREAKDOWN TYPE
============================ */
export interface PricingBreakdown {
  laborCost: number;
  equipmentCost: number;
  overheadAllocation: number;
  materialCost: number;
  directCosts: number;
  marginAmount: number;
  floorPrice: number;
  calculatedPrice: number;
  finalPrice: number;
  costProfileVersion: number;
}

/* ============================
   SESSION STORAGE
============================ */
export const sessions = pgTable(
  'sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull(),
  },
  (t) => [index('idx_session_expire').on(t.expire)]
);

/* ============================
   COMPANIES
============================ */
export const companies = pgTable('companies', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  timezone: varchar('timezone', { length: 50 }).default('America/New_York').notNull(),
  logoUrl: text('logo_url'),
  primaryAddress: text('primary_address'),
  primaryPhone: varchar('primary_phone', { length: 20 }),
  primaryEmail: varchar('primary_email', { length: 255 }),
  serviceAreaZips: text('service_area_zips').array(),
  defaultTaxRate: decimal('default_tax_rate', { precision: 5, scale: 4 }).default('0.0000'),
  operatingMode: varchar('operating_mode', { length: 20 }).default('small_team').notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  stripeAccountId: varchar('stripe_account_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

/* ============================
   USERS
============================ */
export const users = pgTable('users', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').references(() => companies.id),
  email: varchar('email', { length: 255 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  profileImageUrl: text('profile_image_url'),
  phone: varchar('phone', { length: 20 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const upsertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  updatedAt: true,
});
export type UpsertUser = z.infer<typeof upsertUserSchema>;
export type User = typeof users.$inferSelect;

/* ============================
   ROLES
============================ */
export const roles = pgTable('roles', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').references(() => companies.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false).notNull(),
  isSystemRole: boolean('is_system_role').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

/* ============================
   PERMISSIONS
============================ */
export const permissions = pgTable('permissions', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  module: varchar('module', { length: 100 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  description: text('description'),
  isDangerGate: boolean('is_danger_gate').default(false).notNull(),
});

export type Permission = typeof permissions.$inferSelect;

/* ============================
   ROLE_PERMISSIONS
============================ */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: varchar('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: varchar('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]
);

/* ============================
   USER_ROLES
============================ */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: varchar('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    assignedBy: varchar('assigned_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })]
);

/* ============================
   COMPANY SETTINGS
============================ */
export const companySettings = pgTable('company_settings', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').notNull().references(() => companies.id),
  businessHoursStart: varchar('business_hours_start', { length: 10 }).default('08:00'),
  businessHoursEnd: varchar('business_hours_end', { length: 10 }).default('17:00'),
  workDaysPerWeek: integer('work_days_per_week').default(5),
  depositPolicy: varchar('deposit_policy', { length: 50 }).default('required').notNull(),
  defaultPaymentPlanTemplate: varchar('default_payment_plan_template', { length: 100 }),
  lateFeePercentage: decimal('late_fee_percentage', { precision: 5, scale: 2 }).default('0.00'),
  autoRemindersEnabled: boolean('auto_reminders_enabled').default(true),
  emailFooter: text('email_footer'),
  brandColors: jsonb('brand_colors'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;

/* ============================
   COST PROFILE SNAPSHOTS
============================ */
export const costProfileSnapshots = pgTable('cost_profile_snapshots', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').notNull().references(() => companies.id),
  version: integer('version').notNull(),
  isLocked: boolean('is_locked').default(false).notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  calculatedOutputs: jsonb('calculated_outputs').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdBy: varchar('created_by').references(() => users.id),
});

export const insertCostProfileSnapshotSchema = createInsertSchema(costProfileSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertCostProfileSnapshot = z.infer<typeof insertCostProfileSnapshotSchema>;
export type CostProfileSnapshot = typeof costProfileSnapshots.$inferSelect;

/* ============================
   AUDIT LOG
============================ */
export const auditLogs = pgTable(
  'audit_log',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id').notNull().references(() => companies.id),
    userId: varchar('user_id').references(() => users.id),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),
    reason: text('reason'),
    isOverride: boolean('is_override').default(false).notNull(),
    ipAddress: varchar('ip_address', { length: 50 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_audit_company').on(t.companyId),
    index('idx_audit_action').on(t.action),
  ]
);

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

/* ============================
   CUSTOMERS
============================ */
export const customers = pgTable('customers', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').notNull().references(() => companies.id),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  preferredContactMethod: varchar('preferred_contact_method', { length: 20 }).default('phone'),
  notes: text('notes'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

/* ============================
   PROPERTIES
============================ */
export const properties = pgTable('properties', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').notNull().references(() => companies.id),
  customerId: varchar('customer_id').notNull().references(() => customers.id),
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 50 }),
  zipCode: varchar('zip_code', { length: 20 }),
  accessNotes: text('access_notes'),
  hasUtilityLines: boolean('has_utility_lines').default(false),
  isPrimaryAddress: boolean('is_primary_address').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
});
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

/* ============================
   LEADS
============================ */
export const leads = pgTable('leads', {
  id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar('company_id').notNull().references(() => companies.id),
  customerId: varchar('customer_id').references(() => customers.id),
  propertyId: varchar('property_id').references(() => properties.id),
  stage: varchar('stage', { length: 50 }).default('new').notNull(),
  source: varchar('source', { length: 100 }),
  assignedTo: varchar('assigned_to').references(() => users.id),
  notes: text('notes'),
  priority: varchar('priority', { length: 20 }).default('normal'),
  followUpDate: timestamp('follow_up_date'),
  estimatedValue: decimal('estimated_value', { precision: 12, scale: 2 }),
  lostReason: text('lost_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

/* ============================
   ESTIMATES
============================ */
export const estimates = pgTable(
  'estimates',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id').notNull().references(() => companies.id),
    customerId: varchar('customer_id').notNull().references(() => customers.id),
    propertyId: varchar('property_id').references(() => properties.id),
    leadId: varchar('lead_id').references(() => leads.id),
    estimateNumber: varchar('estimate_number', { length: 50 }).notNull(),
    status: varchar('status', { length: 30 }).default('draft').notNull(),
    title: text('title'),
    description: text('description'),
    jobAddress: text('job_address'),
    workItems: jsonb('work_items').default([]).notNull(),
    pricingProfileId: varchar('pricing_profile_id'),
    inputSnapshot: jsonb('input_snapshot'),
    pricingSnapshot: jsonb('pricing_snapshot'),
    validUntil: timestamp('valid_until'),
    sentAt: timestamp('sent_at'),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    expiredAt: timestamp('expired_at'),
    magicLinkTokenHash: varchar('magic_link_token_hash', { length: 255 }),
    magicLinkExpiresAt: timestamp('magic_link_expires_at'),
    magicLinkUsedAt: timestamp('magic_link_used_at'),
    parentEstimateId: varchar('parent_estimate_id'),
    version: integer('version').default(1).notNull(),
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_estimate_company').on(t.companyId),
    index('idx_estimate_status').on(t.status),
    uniqueIndex('idx_estimate_number').on(t.companyId, t.estimateNumber),
  ]
);

export const insertEstimateSchema = createInsertSchema(estimates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimates.$inferSelect;

/* ============================
   ESTIMATE SNAPSHOTS
============================ */
export const estimateSnapshots = pgTable(
  'estimate_snapshots',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    estimateId: varchar('estimate_id').notNull().references(() => estimates.id),
    snapshotVersion: integer('snapshot_version').notNull(),
    triggerAction: varchar('trigger_action', { length: 50 }).notNull(),
    costProfileSnapshotId: varchar('cost_profile_snapshot_id').notNull().references(() => costProfileSnapshots.id),
    workItemsSnapshot: jsonb('work_items_snapshot').notNull(),
    pricingBreakdown: jsonb('pricing_breakdown').notNull(),
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxRate: decimal('tax_rate', { precision: 5, scale: 4 }).notNull(),
    taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),
    marginPercentage: decimal('margin_percentage', { precision: 5, scale: 2 }).notNull(),
    isOverride: boolean('is_override').default(false).notNull(),
    overrideReason: text('override_reason'),
    overrideMultiplier: decimal('override_multiplier', { precision: 5, scale: 4 }),
    floorViolation: boolean('floor_violation').default(false).notNull(),
    previousStatus: varchar('previous_status', { length: 30 }),
    newStatus: varchar('new_status', { length: 30 }).notNull(),
    actorId: varchar('actor_id').references(() => users.id),
    actorType: varchar('actor_type', { length: 20 }).default('user').notNull(),
    ipAddress: varchar('ip_address', { length: 50 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_snapshot_estimate').on(t.estimateId),
  ]
);

export const insertEstimateSnapshotSchema = createInsertSchema(estimateSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertEstimateSnapshot = z.infer<typeof insertEstimateSnapshotSchema>;
export type EstimateSnapshot = typeof estimateSnapshots.$inferSelect;

/* ============================
   ESTIMATE FIELD REGISTRY
   (Configurable Fields per Company)
============================ */
export const estimateFieldTypes = ['number', 'checkbox', 'select', 'text', 'textarea'] as const;
export type EstimateFieldType = (typeof estimateFieldTypes)[number];

export const estimateFields = pgTable(
  'estimate_fields',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id').notNull().references(() => companies.id),
    fieldKey: varchar('field_key', { length: 100 }).notNull(),
    label: varchar('label', { length: 200 }).notNull(),
    fieldType: varchar('field_type', { length: 20 }).notNull(),
    appliesTo: text('applies_to').array().default(['internal', 'marketing']).notNull(),
    required: boolean('required').default(false).notNull(),
    defaultValue: jsonb('default_value'),
    options: jsonb('options'),
    visibilityRules: jsonb('visibility_rules'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_estimate_field_company').on(t.companyId),
    uniqueIndex('idx_estimate_field_key').on(t.companyId, t.fieldKey),
  ]
);

export const insertEstimateFieldSchema = createInsertSchema(estimateFields).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEstimateField = z.infer<typeof insertEstimateFieldSchema>;
export type EstimateField = typeof estimateFields.$inferSelect;

/* ============================
   PRICING PROFILES
   (Configurable Pricing Configurations)
============================ */
export const pricingProfiles = pgTable(
  'pricing_profiles',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id').notNull().references(() => companies.id),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    baseRates: jsonb('base_rates').default({}).notNull(),
    taxRules: jsonb('tax_rules').default({}).notNull(),
    depositRules: jsonb('deposit_rules').default({}).notNull(),
    commissionRules: jsonb('commission_rules').default({}).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_pricing_profile_company').on(t.companyId),
  ]
);

export const insertPricingProfileSchema = createInsertSchema(pricingProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPricingProfile = z.infer<typeof insertPricingProfileSchema>;
export type PricingProfile = typeof pricingProfiles.$inferSelect;

/* ============================
   PRICING RULES
   (Field → Pricing Effect Mapping)
============================ */
export const pricingEffectTypes = ['flat', 'percentage', 'multiplier', 'perUnit'] as const;
export type PricingEffectType = (typeof pricingEffectTypes)[number];

export const pricingRules = pgTable(
  'pricing_rules',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id').notNull().references(() => companies.id),
    pricingProfileId: varchar('pricing_profile_id').references(() => pricingProfiles.id),
    fieldId: varchar('field_id').references(() => estimateFields.id),
    ruleName: varchar('rule_name', { length: 200 }).notNull(),
    effectType: varchar('effect_type', { length: 20 }).notNull(),
    effectValue: decimal('effect_value', { precision: 12, scale: 4 }).notNull(),
    appliesWhen: jsonb('applies_when'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_pricing_rule_company').on(t.companyId),
    index('idx_pricing_rule_profile').on(t.pricingProfileId),
  ]
);

export const insertPricingRuleSchema = createInsertSchema(pricingRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRules.$inferSelect;

/* ============================
   ESTIMATE TOOL CONFIG
   (Pricing Tool Settings for New Estimate page)
============================ */
export const treeSizePricingSchema = z.object({
  small: z.number().nonnegative(),
  medium: z.number().nonnegative(),
  large: z.number().nonnegative(),
  xl: z.number().nonnegative(),
});

export const clientTypePricingSchema = z.object({
  residential: treeSizePricingSchema,
  solar: treeSizePricingSchema,
  referral: treeSizePricingSchema,
});

export const riskModifierSchema = z.object({
  key: z.string(),
  label: z.string(),
  percentage: z.number().min(0).max(100),
  isActive: z.boolean().default(true),
});

export const stumpGrindingSchema = z.object({
  small: z.number().nonnegative(),
  large: z.number().nonnegative(),
});

export const discountRuleSchema = z.object({
  multiTreeThreshold: z.number().int().positive(),
  multiTreeDiscountPercent: z.number().min(0).max(100),
});

export const estimateToolConfigDataSchema = z.object({
  clientTypePricing: clientTypePricingSchema,
  riskModifiers: z.array(riskModifierSchema),
  stumpGrinding: stumpGrindingSchema,
  discountRules: discountRuleSchema,
  taxRate: z.number().min(0).max(100),
  commissionRate: z.number().min(0).max(100),
  dayRate: z.number().nonnegative().optional(),
});

export type EstimateToolConfigData = z.infer<typeof estimateToolConfigDataSchema>;

export const estimateToolConfigs = pgTable(
  'estimate_tool_configs',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id').notNull().references(() => companies.id).unique(),
    configData: jsonb('config_data').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_estimate_tool_config_company').on(t.companyId),
  ]
);

export const insertEstimateToolConfigSchema = createInsertSchema(estimateToolConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEstimateToolConfig = z.infer<typeof insertEstimateToolConfigSchema>;
export type EstimateToolConfig = typeof estimateToolConfigs.$inferSelect;

/* ============================
   ESTIMATE ENGINE TYPES
   (Shared types for preview/finalize)
============================ */
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

export interface EstimateOptionPreview {
  name: string;
  pricingSnapshot: PricingSnapshot;
  workItemsSnapshot: WorkItem[];
}

export interface EstimatePreviewResult {
  inputSnapshot: Record<string, any>;
  fieldsUsed: EstimateField[];
  pricingProfile: PricingProfile | null;
  pricingSnapshot: PricingSnapshot;
  workItemsSnapshot: WorkItem[];
  options?: EstimateOptionPreview[];
}

/* ============================
   JOBS
   (PRODUCTION / SCHEDULING ENTITY)
============================ */
export const jobStatuses = [
  'pending',
  'scheduled',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const jobs = pgTable(
  'jobs',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),

    customerId: varchar('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    propertyId: varchar('property_id')
      .references(() => properties.id, { onDelete: 'set null' }),

    estimateId: varchar('estimate_id')
      .references(() => estimates.id, { onDelete: 'set null' }),

    status: varchar('status', { length: 20 }).default('pending').notNull(),

    title: text('title'),
    description: text('description'),
    notes: text('notes'),

    scheduledDate: timestamp('scheduled_date'),
    completedAt: timestamp('completed_at'),
    closedAt: timestamp('closed_at'),

    depositPaid: boolean('deposit_paid').default(false).notNull(),

    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_job_company').on(t.companyId),
    index('idx_job_customer').on(t.customerId),
    index('idx_job_status').on(t.status),
    index('idx_job_estimate').on(t.estimateId),
  ]
);

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

// Validation schemas for job API endpoints
export const createJobInputSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  propertyId: z.string().optional().nullable(),
  estimateId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  scheduledDate: z.string().datetime().optional().nullable(),
});
export type CreateJobInput = z.infer<typeof createJobInputSchema>;

// Status transitions allowed via PATCH (closed and cancelled require special endpoints)
export const updateableJobStatuses = ['pending', 'scheduled', 'in_progress', 'completed'] as const;
export const updateJobInputSchema = z.object({
  status: z.enum(updateableJobStatuses).optional(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  scheduledDate: z.string().datetime().optional().nullable(),
});
export type UpdateJobInput = z.infer<typeof updateJobInputSchema>;

/* ============================
   CREWS (SCHEDULING)
============================ */
export const crews = pgTable(
  'crews',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    color: varchar('color', { length: 7 }).default('#3B82F6'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_crew_company').on(t.companyId),
  ]
);

export const insertCrewSchema = createInsertSchema(crews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCrew = z.infer<typeof insertCrewSchema>;
export type Crew = typeof crews.$inferSelect;

/* ============================
   CREW MEMBERS (SCHEDULING)
============================ */
export const crewMembers = pgTable(
  'crew_members',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    crewId: varchar('crew_id')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
    userId: varchar('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).default('member').notNull(),
    isLead: boolean('is_lead').default(false).notNull(),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_crew_member_crew').on(t.crewId),
    index('idx_crew_member_user').on(t.userId),
    uniqueIndex('idx_crew_member_unique').on(t.crewId, t.userId),
  ]
);

export const insertCrewMemberSchema = createInsertSchema(crewMembers).omit({
  id: true,
  addedAt: true,
});
export type InsertCrewMember = z.infer<typeof insertCrewMemberSchema>;
export type CrewMember = typeof crewMembers.$inferSelect;

/* ============================
   EQUIPMENT (SCHEDULING)
============================ */
export const equipmentStatuses = ['available', 'in_use', 'maintenance', 'retired'] as const;
export type EquipmentStatus = (typeof equipmentStatuses)[number];

export const equipment = pgTable(
  'equipment',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 150 }).notNull(),
    type: varchar('type', { length: 100 }),
    description: text('description'),
    status: varchar('status', { length: 20 }).default('available').notNull(),
    serialNumber: varchar('serial_number', { length: 100 }),
    purchaseDate: timestamp('purchase_date'),
    lastMaintenanceDate: timestamp('last_maintenance_date'),
    nextMaintenanceDate: timestamp('next_maintenance_date'),
    notes: text('notes'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_equipment_company').on(t.companyId),
    index('idx_equipment_status').on(t.status),
  ]
);

export const insertEquipmentSchema = createInsertSchema(equipment).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipment.$inferSelect;

/* ============================
   CREW ASSIGNMENTS (SCHEDULING)
   - Links crews to jobs for specific dates
============================ */
export const crewAssignments = pgTable(
  'crew_assignments',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    jobId: varchar('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    crewId: varchar('crew_id')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
    scheduledDate: timestamp('scheduled_date').notNull(),
    startTime: varchar('start_time', { length: 10 }),
    endTime: varchar('end_time', { length: 10 }),
    notes: text('notes'),
    isOverridden: boolean('is_overridden').default(false).notNull(),
    overrideReason: text('override_reason'),
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_crew_assignment_company').on(t.companyId),
    index('idx_crew_assignment_job').on(t.jobId),
    index('idx_crew_assignment_crew').on(t.crewId),
    index('idx_crew_assignment_date').on(t.scheduledDate),
  ]
);

export const insertCrewAssignmentSchema = createInsertSchema(crewAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCrewAssignment = z.infer<typeof insertCrewAssignmentSchema>;
export type CrewAssignment = typeof crewAssignments.$inferSelect;

/* ============================
   EQUIPMENT RESERVATIONS (SCHEDULING)
   - Links equipment to jobs for specific dates
============================ */
export const equipmentReservations = pgTable(
  'equipment_reservations',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),
    jobId: varchar('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    equipmentId: varchar('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
    scheduledDate: timestamp('scheduled_date').notNull(),
    startTime: varchar('start_time', { length: 10 }),
    endTime: varchar('end_time', { length: 10 }),
    notes: text('notes'),
    isOverridden: boolean('is_overridden').default(false).notNull(),
    overrideReason: text('override_reason'),
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_equipment_reservation_company').on(t.companyId),
    index('idx_equipment_reservation_job').on(t.jobId),
    index('idx_equipment_reservation_equipment').on(t.equipmentId),
    index('idx_equipment_reservation_date').on(t.scheduledDate),
  ]
);

export const insertEquipmentReservationSchema = createInsertSchema(equipmentReservations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEquipmentReservation = z.infer<typeof insertEquipmentReservationSchema>;
export type EquipmentReservation = typeof equipmentReservations.$inferSelect;

/* ============================
   INVOICES
============================ */
export const invoiceStatuses = [
  'draft',
  'sent',
  'viewed',
  'partially_paid',
  'paid',
  'overdue',
  'voided',
  'disputed',
  'refunded',
  'written_off',
] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

export const invoiceTypes = ['deposit', 'progress', 'final', 'full'] as const;
export type InvoiceType = (typeof invoiceTypes)[number];

export const invoices = pgTable(
  'invoices',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),

    customerId: varchar('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    estimateId: varchar('estimate_id').references(() => estimates.id),
    estimateSnapshotId: varchar('estimate_snapshot_id').references(() => estimateSnapshots.id),
    jobId: varchar('job_id').references(() => jobs.id, { onDelete: 'set null' }),

    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
    invoiceType: varchar('invoice_type', { length: 20 }).default('full').notNull(),
    status: varchar('status', { length: 20 }).default('draft').notNull(),

    title: text('title'),
    description: text('description'),
    lineItems: jsonb('line_items').default([]).notNull(),

    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxRate: decimal('tax_rate', { precision: 5, scale: 4 }).notNull(),
    taxAmount: decimal('tax_amount', { precision: 12, scale: 2 }).notNull(),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),

    sentAt: timestamp('sent_at'),
    viewedAt: timestamp('viewed_at'),
    paidAt: timestamp('paid_at'),
    overdueAt: timestamp('overdue_at'),
    voidedAt: timestamp('voided_at'),
    voidReason: text('void_reason'),
    writtenOffAt: timestamp('written_off_at'),
    writtenOffReason: text('written_off_reason'),
    writtenOffBy: varchar('written_off_by').references(() => users.id),
    disputedAt: timestamp('disputed_at'),
    stripeDisputeId: varchar('stripe_dispute_id', { length: 100 }),
    refundedAt: timestamp('refunded_at'),

    stripeAccountId: varchar('stripe_account_id', { length: 100 }),
    stripeCheckoutSessionId: varchar('stripe_checkout_session_id', { length: 100 }),
    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 100 }),

    magicLinkTokenHash: varchar('magic_link_token_hash', { length: 255 }),
    magicLinkExpiresAt: timestamp('magic_link_expires_at'),

    amountPaid: decimal('amount_paid', { precision: 12, scale: 2 }).default('0.00'),
    amountDue: decimal('amount_due', { precision: 12, scale: 2 }),
    dueDate: timestamp('due_date'),

    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    version: integer('version').default(1).notNull(),
  },
  (t) => [
    index('idx_invoice_company').on(t.companyId),
    index('idx_invoice_status').on(t.status),
    uniqueIndex('idx_invoice_company_number').on(t.companyId, t.invoiceNumber),
  ]
);

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
});
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export const invoiceLineItemSchema = z.object({
  id: z.string().optional(),
  description: z.string(),
  quantity: z.number(),
  unit: z.string().optional(),
  unitPrice: z.number(),
  amount: z.number(),
  total: z.number().optional(),
});
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

/* ============================
   PAYMENTS (LEDGER)
============================ */
export const paymentStatuses = ['initiated', 'succeeded', 'failed', 'refunded', 'disputed'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const paymentMethods = ['stripe', 'offline'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const payments = pgTable(
  'payments',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),

    invoiceId: varchar('invoice_id').references(() => invoices.id),

    method: varchar('method', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(),

    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),

    stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 100 }),
    stripeChargeId: varchar('stripe_charge_id', { length: 100 }),

    checkNumber: varchar('check_number', { length: 50 }),
    referenceNumber: varchar('reference_number', { length: 100 }),
    notes: text('notes'),

    refundedAmount: decimal('refunded_amount', { precision: 12, scale: 2 }),
    refundReason: text('refund_reason'),
    refundedAt: timestamp('refunded_at'),
    refundedBy: varchar('refunded_by').references(() => users.id),

    recordedBy: varchar('recorded_by').references(() => users.id),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_payment_company').on(t.companyId),
    index('idx_payment_status').on(t.status),
    index('idx_payment_invoice').on(t.invoiceId),
    index('idx_payment_intent').on(t.stripePaymentIntentId),
  ]
);

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

/* ============================
   INVOICE ALLOCATIONS
   (PARTIAL PAYMENTS)
============================ */
export const invoiceAllocations = pgTable(
  'invoice_allocations',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    invoiceId: varchar('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),

    paymentId: varchar('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),

    amountApplied: decimal('amount_applied', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_allocation_invoice').on(t.invoiceId),
    index('idx_allocation_payment').on(t.paymentId),
  ]
);

export type InvoiceAllocation = typeof invoiceAllocations.$inferSelect;

/* ============================
   PAYMENT PLAN TEMPLATES
   (COMPANY-LEVEL DEPOSIT/MILESTONE CONFIGS)
============================ */
export const paymentPlanTemplates = pgTable(
  'payment_plan_templates',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    // Milestones as JSON array: [{name, type: 'percent'|'flat', value, invoiceType}]
    milestones: jsonb('milestones').default([]).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_payment_plan_company').on(t.companyId),
  ]
);

export const insertPaymentPlanTemplateSchema = createInsertSchema(paymentPlanTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentPlanTemplate = z.infer<typeof insertPaymentPlanTemplateSchema>;
export type PaymentPlanTemplate = typeof paymentPlanTemplates.$inferSelect;

/* ============================
   STRIPE EVENT IDEMPOTENCY
============================ */
export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: varchar('id').primaryKey(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    processedAt: timestamp('processed_at').defaultNow().notNull(),
    payload: jsonb('payload'),
  },
  (t) => [index('idx_stripe_event_type').on(t.eventType)]
);

export type StripeEvent = typeof stripeEvents.$inferSelect;
export type InsertStripeEvent = typeof stripeEvents.$inferInsert;

/* ============================
   CONTRACT TEMPLATES
============================ */
export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    // Template content with placeholders like {{customerName}}, {{workItems}}, {{total}}
    headerContent: text('header_content'),
    termsContent: text('terms_content'),
    footerContent: text('footer_content'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_contract_template_company').on(t.companyId),
  ]
);

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type ContractTemplate = typeof contractTemplates.$inferSelect;

/* ============================
   CONTRACTS
============================ */
export const contracts = pgTable(
  'contracts',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    estimateId: varchar('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),

    customerId: varchar('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),

    templateId: varchar('template_id')
      .references(() => contractTemplates.id, { onDelete: 'set null' }),

    contractNumber: varchar('contract_number', { length: 50 }).notNull(),

    // Status: draft, sent, signed, expired, voided
    status: varchar('status', { length: 20 }).default('draft').notNull(),

    // Generated contract content (rendered from template with actual values)
    headerContent: text('header_content'),
    workItemsContent: text('work_items_content'),
    termsContent: text('terms_content'),
    footerContent: text('footer_content'),

    // Snapshot of key estimate data at time of contract generation
    estimateSnapshot: jsonb('estimate_snapshot'),

    // Signature details
    signedAt: timestamp('signed_at'),
    signerName: varchar('signer_name', { length: 200 }),
    signerInitials: varchar('signer_initials', { length: 10 }),
    signatureData: text('signature_data'), // Base64 encoded signature image or typed signature
    signerIpAddress: varchar('signer_ip_address', { length: 45 }),
    signerUserAgent: text('signer_user_agent'),

    // Magic link for customer signing
    magicLinkTokenHash: varchar('magic_link_token_hash', { length: 64 }),
    magicLinkExpiresAt: timestamp('magic_link_expires_at'),
    magicLinkUsedAt: timestamp('magic_link_used_at'),

    sentAt: timestamp('sent_at'),
    voidedAt: timestamp('voided_at'),
    voidedReason: text('voided_reason'),

    // Immutability lock - set when contract is signed, never cleared
    lockedAt: timestamp('locked_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_contract_company').on(t.companyId),
    index('idx_contract_estimate').on(t.estimateId),
    index('idx_contract_customer').on(t.customerId),
    index('idx_contract_status').on(t.status),
    index('idx_contract_magic_link').on(t.magicLinkTokenHash),
  ]
);

export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lockedAt: true,
});
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

/* ============================
   SIGNED CONTRACT SNAPSHOTS
   (Immutable, append-only record of signed contract content)
============================ */
export const signedContractSnapshots = pgTable(
  'signed_contract_snapshots',
  {
    id: varchar('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    contractId: varchar('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    // Complete contract content at time of signing (legally defensible)
    headerContent: text('header_content'),
    workItemsContent: text('work_items_content'),
    termsContent: text('terms_content'),
    footerContent: text('footer_content'),
    estimateSnapshot: jsonb('estimate_snapshot'),

    // Signature details captured at signing
    signedAt: timestamp('signed_at').notNull(),
    signerName: varchar('signer_name', { length: 200 }).notNull(),
    signerInitials: varchar('signer_initials', { length: 10 }),
    signatureData: text('signature_data'),
    signerIpAddress: varchar('signer_ip_address', { length: 45 }),
    signerUserAgent: text('signer_user_agent'),

    // Immutable creation timestamp
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_signed_snapshot_contract').on(t.contractId),
    index('idx_signed_snapshot_company').on(t.companyId),
  ]
);

export const insertSignedContractSnapshotSchema = createInsertSchema(signedContractSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertSignedContractSnapshot = z.infer<typeof insertSignedContractSnapshotSchema>;
export type SignedContractSnapshot = typeof signedContractSnapshots.$inferSelect;

/* ============================
   PAYMENT PLAN SCHEDULE ITEM TYPE
============================ */
export const paymentPlanScheduleItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().nonnegative(),
  dueDate: z.string().nullable(),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']),
  paidAt: z.string().nullable(),
  invoiceId: z.string().nullable(),
  stripePaymentIntentId: z.string().nullable(),
});
export type PaymentPlanScheduleItem = z.infer<typeof paymentPlanScheduleItemSchema>;

/* ============================
   PAYMENT PLANS
   (CUSTOMER-FACING PAYMENT PORTAL)
============================ */
export const paymentPlanStatuses = [
  'active',
  'completed',
  'cancelled',
  'overdue',
] as const;
export type PaymentPlanStatus = (typeof paymentPlanStatuses)[number];

export const paymentPlans = pgTable(
  'payment_plans',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),

    customerId: varchar('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    jobId: varchar('job_id')
      .references(() => jobs.id, { onDelete: 'set null' }),

    estimateId: varchar('estimate_id')
      .references(() => estimates.id, { onDelete: 'set null' }),

    templateId: varchar('template_id')
      .references(() => paymentPlanTemplates.id, { onDelete: 'set null' }),

    planNumber: varchar('plan_number', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    title: text('title'),
    description: text('description'),

    // Schedule as JSON array of milestones/installments
    schedule: jsonb('schedule').default([]).notNull(),

    // Financial tracking
    totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
    amountPaid: decimal('amount_paid', { precision: 12, scale: 2 }).default('0.00').notNull(),
    amountDue: decimal('amount_due', { precision: 12, scale: 2 }).notNull(),

    // Magic link for customer portal access
    magicLinkTokenHash: varchar('magic_link_token_hash', { length: 64 }),
    magicLinkExpiresAt: timestamp('magic_link_expires_at'),
    magicLinkLastAccessedAt: timestamp('magic_link_last_accessed_at'),

    // Dates
    startDate: timestamp('start_date'),
    expectedCompletionDate: timestamp('expected_completion_date'),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),
    cancelledReason: text('cancelled_reason'),

    sentAt: timestamp('sent_at'),
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_pp_company').on(t.companyId),
    index('idx_pp_customer').on(t.customerId),
    index('idx_pp_job').on(t.jobId),
    index('idx_pp_status').on(t.status),
    index('idx_pp_magic_link').on(t.magicLinkTokenHash),
    uniqueIndex('idx_pp_number').on(t.companyId, t.planNumber),
  ]
);

export const insertPaymentPlanSchema = createInsertSchema(paymentPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentPlan = z.infer<typeof insertPaymentPlanSchema>;
export type PaymentPlan = typeof paymentPlans.$inferSelect;

/* ============================
   SERVICE REQUEST CATEGORIES
   (FOR UPSELL WIZARD)
============================ */
export const serviceRequestCategories = [
  'tree_removal',
  'tree_trimming',
  'stump_grinding',
  'storm_cleanup',
  'seasonal_maintenance',
  'brush_clearing',
  'gutter_cleaning',
  'emergency_service',
  'other',
] as const;
export type ServiceRequestCategory = (typeof serviceRequestCategories)[number];

export const serviceRequestStatuses = [
  'submitted',
  'reviewed',
  'quoted',
  'accepted',
  'scheduled',
  'completed',
  'declined',
] as const;
export type ServiceRequestStatus = (typeof serviceRequestStatuses)[number];

/* ============================
   SERVICE REQUESTS
   (UPSELL FROM PAYMENT PLAN PORTAL)
============================ */
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict' }),

    customerId: varchar('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    paymentPlanId: varchar('payment_plan_id')
      .references(() => paymentPlans.id, { onDelete: 'set null' }),

    // If this request was converted to a lead/estimate
    leadId: varchar('lead_id')
      .references(() => leads.id, { onDelete: 'set null' }),
    estimateId: varchar('estimate_id')
      .references(() => estimates.id, { onDelete: 'set null' }),

    requestNumber: varchar('request_number', { length: 50 }).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    status: varchar('status', { length: 20 }).default('submitted').notNull(),

    title: varchar('title', { length: 200 }),
    description: text('description'),
    preferredTimeframe: varchar('preferred_timeframe', { length: 100 }),
    urgency: varchar('urgency', { length: 20 }).default('normal'),

    // Photos/attachments as JSON array of URLs
    attachments: jsonb('attachments').default([]),

    // Address (may be different from original job)
    serviceAddress: text('service_address'),
    useExistingAddress: boolean('use_existing_address').default(true),

    // Internal notes
    internalNotes: text('internal_notes'),
    reviewedBy: varchar('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),

    // Source tracking
    submittedVia: varchar('submitted_via', { length: 20 }).default('portal'),
    submitterIpAddress: varchar('submitter_ip_address', { length: 45 }),
    submitterUserAgent: text('submitter_user_agent'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_svcreq_company').on(t.companyId),
    index('idx_svcreq_customer').on(t.customerId),
    index('idx_svcreq_payment_plan').on(t.paymentPlanId),
    index('idx_svcreq_status').on(t.status),
    uniqueIndex('idx_svcreq_number').on(t.companyId, t.requestNumber),
  ]
);

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;

/* ============================
   PRICING TOOL FIELD CONFIG
============================ */
export const pricingToolFieldSchema = z.object({
  id: z.string(),
  type: z.enum(['tree_photo', 'tree_height', 'tree_count', 'hazards', 'location', 'stump_grinding', 'debris_haul', 'custom_text', 'custom_select']),
  label: z.string(),
  required: z.boolean().default(true),
  enabled: z.boolean().default(true),
  options: z.array(z.string()).optional(), // For select fields
  placeholder: z.string().optional(),
});
export type PricingToolField = z.infer<typeof pricingToolFieldSchema>;

export const pricingToolConfigSchema = z.object({
  headline: z.string().default('Get Your Instant Quote'),
  subheadline: z.string().optional(),
  buttonText: z.string().default('Get My Price'),
  thankYouMessage: z.string().default('Thanks! We will be in touch shortly.'),
  showPriceRange: z.boolean().default(true),
  fields: z.array(pricingToolFieldSchema),
  // Pricing multipliers for instant quotes
  basePrice: z.number().default(500),
  heightMultipliers: z.record(z.string(), z.number()).optional(), // e.g., {"0-20": 1, "20-40": 1.5, "40-60": 2}
  hazardMultiplier: z.number().default(1.25), // Over house/powerlines
  stumpGrindingAddon: z.number().default(150),
});
export type PricingToolConfig = z.infer<typeof pricingToolConfigSchema>;

/* ============================
   PRICING TOOLS
   (CONFIGURABLE PUBLIC QUOTE FORMS)
============================ */
export const pricingTools = pgTable(
  'pricing_tools',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    description: text('description'),

    // Tool type: public_quote (landing page), internal_estimate (staff use)
    type: varchar('type', { length: 30 }).default('public_quote').notNull(),

    // Configuration JSON
    config: jsonb('config').notNull(),

    // Activation
    isPublic: boolean('is_public').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    // Stats
    viewCount: integer('view_count').default(0).notNull(),
    submissionCount: integer('submission_count').default(0).notNull(),

    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_pricing_tool_company').on(t.companyId),
    uniqueIndex('idx_pricing_tool_slug').on(t.companyId, t.slug),
  ]
);

export const insertPricingToolSchema = createInsertSchema(pricingTools).omit({
  id: true,
  viewCount: true,
  submissionCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPricingTool = z.infer<typeof insertPricingToolSchema>;
export type PricingTool = typeof pricingTools.$inferSelect;

/* ============================
   PUBLIC QUOTE REQUESTS
   (SUBMISSIONS FROM PRICING TOOLS)
============================ */
export const publicQuoteRequests = pgTable(
  'public_quote_requests',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),

    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    pricingToolId: varchar('pricing_tool_id')
      .notNull()
      .references(() => pricingTools.id, { onDelete: 'cascade' }),

    // If converted to a lead
    leadId: varchar('lead_id')
      .references(() => leads.id, { onDelete: 'set null' }),

    // Contact info
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),

    // Location
    address: text('address'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 50 }),
    zipCode: varchar('zip_code', { length: 20 }),

    // Quote details (stored as JSON for flexibility)
    formData: jsonb('form_data').notNull(),

    // Calculated quote
    estimatedPriceLow: decimal('estimated_price_low', { precision: 12, scale: 2 }),
    estimatedPriceHigh: decimal('estimated_price_high', { precision: 12, scale: 2 }),

    // Photo uploads (array of URLs)
    photos: jsonb('photos').default([]),

    // Status
    status: varchar('status', { length: 30 }).default('new').notNull(),
    convertedAt: timestamp('converted_at'),

    // Tracking
    submitterIpAddress: varchar('submitter_ip_address', { length: 45 }),
    submitterUserAgent: text('submitter_user_agent'),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_pqr_company').on(t.companyId),
    index('idx_pqr_pricing_tool').on(t.pricingToolId),
    index('idx_pqr_status').on(t.status),
    index('idx_pqr_lead').on(t.leadId),
  ]
);

export const insertPublicQuoteRequestSchema = createInsertSchema(publicQuoteRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertPublicQuoteRequest = z.infer<typeof insertPublicQuoteRequestSchema>;
export type PublicQuoteRequest = typeof publicQuoteRequests.$inferSelect;

/* ============================
   MARKETING CAMPAIGNS
============================ */
export const marketingCampaigns = pgTable(
  'marketing_campaigns',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    platform: varchar('platform', { length: 50 }), // facebook, instagram, google, sms, direct
    status: varchar('status', { length: 30 }).default('active').notNull(), // active, paused, archived
    budgetAmount: decimal('budget_amount', { precision: 12, scale: 2 }),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mc_company').on(t.companyId),
    index('idx_mc_status').on(t.status),
  ]
);

export const insertMarketingCampaignSchema = createInsertSchema(marketingCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMarketingCampaign = z.infer<typeof insertMarketingCampaignSchema>;
export type MarketingCampaign = typeof marketingCampaigns.$inferSelect;

/* ============================
   MARKETING PAGE INPUT SCHEMA
============================ */
export const marketingPageFieldSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'email', 'phone', 'address', 'textarea', 'checkbox', 'select', 'photo']),
  label: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(), // for select fields
});
export type MarketingPageField = z.infer<typeof marketingPageFieldSchema>;

/* ============================
   MARKETING PAGES
============================ */
export const marketingPages = pgTable(
  'marketing_pages',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    campaignId: varchar('campaign_id')
      .references(() => marketingCampaigns.id, { onDelete: 'set null' }),
    
    // Page content
    title: varchar('title', { length: 200 }).notNull(),
    headline: varchar('headline', { length: 300 }),
    description: text('description'),
    ctaText: varchar('cta_text', { length: 100 }).default('Get Your Free Quote'),
    thankYouMessage: text('thank_you_message'),
    
    // Visual customization
    heroImageUrl: text('hero_image_url'),
    logoUrl: text('logo_url'),
    primaryColor: varchar('primary_color', { length: 20 }),
    
    // Form configuration (array of field definitions)
    inputFields: jsonb('input_fields').default([]).notNull(),
    
    // Magic link
    magicToken: varchar('magic_token', { length: 64 }).unique().notNull(),
    
    // Status & tracking
    status: varchar('status', { length: 30 }).default('draft').notNull(), // draft, live, archived
    publishedAt: timestamp('published_at'),
    archivedAt: timestamp('archived_at'),
    
    // Analytics (denormalized for fast reads)
    viewCount: integer('view_count').default(0).notNull(),
    submissionCount: integer('submission_count').default(0).notNull(),
    
    // Platform intent
    platform: varchar('platform', { length: 50 }), // facebook, instagram, google, sms, direct
    
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mp_company').on(t.companyId),
    index('idx_mp_campaign').on(t.campaignId),
    index('idx_mp_status').on(t.status),
    uniqueIndex('idx_mp_magic_token').on(t.magicToken),
  ]
);

export const insertMarketingPageSchema = createInsertSchema(marketingPages).omit({
  id: true,
  viewCount: true,
  submissionCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMarketingPage = z.infer<typeof insertMarketingPageSchema>;
export type MarketingPage = typeof marketingPages.$inferSelect;

/* ============================
   MARKETING PAGE VIEWS (Analytics)
============================ */
export const marketingPageViews = pgTable(
  'marketing_page_views',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    pageId: varchar('page_id')
      .notNull()
      .references(() => marketingPages.id, { onDelete: 'cascade' }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),
    viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_mpv_page').on(t.pageId),
    index('idx_mpv_viewed_at').on(t.viewedAt),
  ]
);

/* ============================
   MARKETING SUBMISSIONS
============================ */
export const marketingSubmissions = pgTable(
  'marketing_submissions',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    pageId: varchar('page_id')
      .notNull()
      .references(() => marketingPages.id, { onDelete: 'cascade' }),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    
    // Created lead (when converted)
    leadId: varchar('lead_id')
      .references(() => leads.id, { onDelete: 'set null' }),
    
    // Form data submitted
    formData: jsonb('form_data').notNull(),
    
    // Extracted contact info for quick access
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    address: text('address'),
    
    // Photo uploads
    photos: jsonb('photos').default([]),
    
    // Tracking
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    utmSource: varchar('utm_source', { length: 100 }),
    utmMedium: varchar('utm_medium', { length: 100 }),
    utmCampaign: varchar('utm_campaign', { length: 100 }),
    
    // Status
    status: varchar('status', { length: 30 }).default('new').notNull(), // new, contacted, converted, archived
    convertedAt: timestamp('converted_at'),
    
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_ms_page').on(t.pageId),
    index('idx_ms_company').on(t.companyId),
    index('idx_ms_lead').on(t.leadId),
    index('idx_ms_status').on(t.status),
    index('idx_ms_submitted_at').on(t.submittedAt),
  ]
);

export const insertMarketingSubmissionSchema = createInsertSchema(marketingSubmissions).omit({
  id: true,
  submittedAt: true,
});
export type InsertMarketingSubmission = z.infer<typeof insertMarketingSubmissionSchema>;
export type MarketingSubmission = typeof marketingSubmissions.$inferSelect;

/* ============================
   MARKETING ASSETS
============================ */
export const marketingAssets = pgTable(
  'marketing_assets',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    pageId: varchar('page_id')
      .references(() => marketingPages.id, { onDelete: 'set null' }),
    
    type: varchar('type', { length: 30 }).notNull(), // ai_image, upload, template
    name: varchar('name', { length: 200 }),
    url: text('url').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    
    // AI generation metadata
    aiPrompt: text('ai_prompt'),
    aiStyle: varchar('ai_style', { length: 50 }), // storm, removal, before_after, emergency
    
    // Performance tracking
    usageCount: integer('usage_count').default(0).notNull(),
    
    createdBy: varchar('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_ma_company').on(t.companyId),
    index('idx_ma_page').on(t.pageId),
    index('idx_ma_type').on(t.type),
  ]
);

export const insertMarketingAssetSchema = createInsertSchema(marketingAssets).omit({
  id: true,
  usageCount: true,
  createdAt: true,
});
export type InsertMarketingAsset = z.infer<typeof insertMarketingAssetSchema>;
export type MarketingAsset = typeof marketingAssets.$inferSelect;

/* ============================
   LEAD SOURCE CONFIGURATION
============================ */
export const leadSources = pgTable(
  'lead_sources',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    companyId: varchar('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_ls_company').on(t.companyId),
  ]
);

export const insertLeadSourceSchema = createInsertSchema(leadSources).omit({
  id: true,
  createdAt: true,
});
export type InsertLeadSource = z.infer<typeof insertLeadSourceSchema>;
export type LeadSource = typeof leadSources.$inferSelect;
