import {
  users,
  companies,
  roles,
  permissions,
  rolePermissions,
  userRoles,
  companySettings,
  costProfileSnapshots,
  auditLogs,
  customers,
  properties,
  leads,
  estimates,
  estimateSnapshots,
  jobs,
  invoices,
  payments,
  invoiceAllocations,
  paymentPlanTemplates,
  stripeEvents,
  crews,
  crewMembers,
  equipment,
  crewAssignments,
  equipmentReservations,
  contractTemplates,
  contracts,
  paymentPlans,
  serviceRequests,
  pricingTools,
  publicQuoteRequests,
  marketingCampaigns,
  marketingPages,
  marketingPageViews,
  marketingSubmissions,
  marketingAssets,
  leadSources,
  estimateFields,
  pricingProfiles,
  pricingRules,
  type User,
  type UpsertUser,
  type Company,
  type InsertCompany,
  type Role,
  type InsertRole,
  type CompanySettings,
  type InsertCompanySettings,
  type CostProfileSnapshot,
  type InsertCostProfileSnapshot,
  type AuditLog,
  type InsertAuditLog,
  type Customer,
  type InsertCustomer,
  type Property,
  type InsertProperty,
  type Lead,
  type InsertLead,
  type Estimate,
  type InsertEstimate,
  type EstimateSnapshot,
  type InsertEstimateSnapshot,
  type Job,
  type InsertJob,
  type Invoice,
  type InsertInvoice,
  type Payment,
  type InsertPayment,
  type InvoiceAllocation,
  type PaymentPlanTemplate,
  type InsertPaymentPlanTemplate,
  type StripeEvent,
  type InsertStripeEvent,
  type Crew,
  type InsertCrew,
  type CrewMember,
  type InsertCrewMember,
  type Equipment,
  type InsertEquipment,
  type CrewAssignment,
  type InsertCrewAssignment,
  type EquipmentReservation,
  type InsertEquipmentReservation,
  type ContractTemplate,
  type InsertContractTemplate,
  type Permission,
  type Contract,
  type InsertContract,
  type SignedContractSnapshot,
  type InsertSignedContractSnapshot,
  signedContractSnapshots,
  type PaymentPlan,
  type InsertPaymentPlan,
  type ServiceRequest,
  type InsertServiceRequest,
  type PricingTool,
  type InsertPricingTool,
  type PublicQuoteRequest,
  type InsertPublicQuoteRequest,
  type MarketingCampaign,
  type InsertMarketingCampaign,
  type MarketingPage,
  type InsertMarketingPage,
  type MarketingSubmission,
  type InsertMarketingSubmission,
  type MarketingAsset,
  type InsertMarketingAsset,
  type LeadSource,
  type InsertLeadSource,
  type EstimateField,
  type InsertEstimateField,
  type PricingProfile,
  type InsertPricingProfile,
  type PricingRule,
  type InsertPricingRule,
  estimateToolConfigs,
  type EstimateToolConfig,
  type InsertEstimateToolConfig,
} from '@shared/schema';

import { db } from './db';
import { eq, and, desc, sql, isNull, gt } from 'drizzle-orm';

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserCompany(userId: string, companyId: string): Promise<User | undefined>;
  getCompanyUsers(companyId: string): Promise<Array<User & { roles: Role[] }>>;

  getCompany(id: string): Promise<Company | undefined>;
  getCompanyBySlug(slug: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined>;

  getRoles(companyId: string): Promise<Role[]>;
  getRole(id: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(companyId: string, id: string, data: Partial<InsertRole>): Promise<Role | undefined>;
  deleteRole(companyId: string, id: string): Promise<boolean>;
  createDefaultRoles(companyId: string): Promise<Role[]>;

  getPermissions(): Promise<Permission[]>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
  setRolePermissions(roleId: string, permissionIds: string[]): Promise<void>;

  assignUserRole(userId: string, roleId: string, assignedBy?: string): Promise<void>;
  removeUserRole(userId: string, roleId: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;

  getCompanySettings(companyId: string): Promise<CompanySettings | undefined>;
  upsertCompanySettings(settings: InsertCompanySettings): Promise<CompanySettings>;

  getCostProfileSnapshots(companyId: string): Promise<CostProfileSnapshot[]>;
  getLatestCostProfileSnapshot(companyId: string): Promise<CostProfileSnapshot | undefined>;
  createCostProfileSnapshot(snapshot: InsertCostProfileSnapshot): Promise<CostProfileSnapshot>;

  createAuditLogEntry(entry: InsertAuditLog): Promise<AuditLog>;
  getAuditLog(companyId: string, limit?: number): Promise<AuditLog[]>;

  getCustomers(companyId: string): Promise<Customer[]>;
  getCustomer(companyId: string, id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(companyId: string, id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(companyId: string, id: string): Promise<boolean>;

  getProperties(companyId: string, customerId: string): Promise<Property[]>;
  getProperty(companyId: string, id: string): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  deleteProperty(companyId: string, id: string): Promise<boolean>;

  getLeads(companyId: string): Promise<Lead[]>;
  getLead(companyId: string, id: string): Promise<Lead | undefined>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(companyId: string, id: string, data: Partial<InsertLead>): Promise<Lead | undefined>;
  deleteLead(companyId: string, id: string): Promise<boolean>;

  getEstimates(companyId: string): Promise<Estimate[]>;
  getEstimate(companyId: string, id: string): Promise<Estimate | undefined>;
  getEstimateWithLatestSnapshot(
    companyId: string,
    id: string
  ): Promise<{ estimate: Estimate; latestSnapshot: EstimateSnapshot | null } | undefined>;
  createEstimate(estimate: InsertEstimate): Promise<Estimate>;
  updateEstimate(companyId: string, id: string, data: Partial<InsertEstimate>): Promise<Estimate | undefined>;
  deleteEstimate(companyId: string, id: string): Promise<boolean>;
  getEstimateByTokenHash(tokenHash: string): Promise<Estimate | undefined>;
  getEstimateByTokenHashForView(tokenHash: string): Promise<Estimate | undefined>;
  markMagicLinkUsed(estimateId: string): Promise<Estimate | undefined>;
  generateEstimateNumber(companyId: string): Promise<string>;

  createEstimateSnapshot(snapshot: InsertEstimateSnapshot): Promise<EstimateSnapshot>;
  getEstimateSnapshots(companyId: string, estimateId: string): Promise<EstimateSnapshot[]>;
  getLatestEstimateSnapshot(companyId: string, estimateId: string): Promise<EstimateSnapshot | undefined>;
  getLatestEstimateSnapshotByEstimateId(estimateId: string): Promise<EstimateSnapshot | undefined>;
  getNextSnapshotVersion(companyId: string, estimateId: string): Promise<number>;

  getJobs(companyId: string): Promise<Job[]>;
  getJob(companyId: string, id: string): Promise<Job | undefined>;
  getJobsByEstimateId(companyId: string, estimateId: string): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(companyId: string, id: string, data: Partial<InsertJob>): Promise<Job | undefined>;
  canCloseJob(companyId: string, jobId: string): Promise<{ canClose: boolean; reason?: string }>;
  canScheduleJob(companyId: string, jobId: string): Promise<{ canSchedule: boolean; reason?: string }>;

  getInvoices(companyId: string): Promise<Invoice[]>;
  getInvoicesByJobId(companyId: string, jobId: string): Promise<Invoice[]>;
  getInvoice(companyId: string, id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(companyId: string, id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  updateInvoiceWithVersionCheck(
    companyId: string, 
    id: string, 
    expectedVersion: number, 
    data: Partial<InsertInvoice>
  ): Promise<{ success: boolean; invoice?: Invoice; currentVersion?: number }>;
  generateInvoiceNumber(companyId: string): Promise<string>;
  getInvoicesByEstimateId(companyId: string, estimateId: string): Promise<Invoice[]>;
  getInvoiceByTokenHashForView(tokenHash: string): Promise<Invoice | undefined>;

  getPayments(companyId: string, invoiceId: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(companyId: string, id: string, data: Partial<InsertPayment>): Promise<Payment | undefined>;
  recordOfflinePaymentTransactional(
    companyId: string,
    invoiceId: string,
    expectedVersion: number,
    paymentData: InsertPayment,
    invoiceUpdates: { amountPaid: string; amountDue: string }
  ): Promise<{ success: true; payment: Payment; invoice: Invoice } | { success: false; error: string; currentVersion?: number }>;

  getInvoiceAllocations(invoiceId: string): Promise<InvoiceAllocation[]>;

  getInvoiceByStripeCheckoutSessionId(sessionId: string): Promise<Invoice | undefined>;
  getPaymentByStripePaymentIntentId(paymentIntentId: string): Promise<Payment | undefined>;

  getPaymentPlanTemplates(companyId: string): Promise<PaymentPlanTemplate[]>;
  getPaymentPlanTemplate(companyId: string, id: string): Promise<PaymentPlanTemplate | undefined>;
  getDefaultPaymentPlanTemplate(companyId: string): Promise<PaymentPlanTemplate | undefined>;
  createPaymentPlanTemplate(template: InsertPaymentPlanTemplate): Promise<PaymentPlanTemplate>;
  updatePaymentPlanTemplate(companyId: string, id: string, data: Partial<InsertPaymentPlanTemplate>): Promise<PaymentPlanTemplate | undefined>;
  setDefaultPaymentPlanTemplate(companyId: string, id: string): Promise<void>;

  getStripeEvent(eventId: string): Promise<StripeEvent | undefined>;
  createStripeEvent(event: InsertStripeEvent): Promise<StripeEvent>;

  // Crews (Scheduling)
  getCrews(companyId: string): Promise<Crew[]>;
  getCrew(companyId: string, id: string): Promise<Crew | undefined>;
  createCrew(crew: InsertCrew): Promise<Crew>;
  updateCrew(companyId: string, id: string, data: Partial<InsertCrew>): Promise<Crew | undefined>;
  deleteCrew(companyId: string, id: string): Promise<boolean>;

  // Crew Members (Scheduling)
  getCrewMembers(crewId: string): Promise<CrewMember[]>;
  addCrewMember(member: InsertCrewMember): Promise<CrewMember>;
  removeCrewMember(crewId: string, userId: string): Promise<boolean>;
  updateCrewMember(crewId: string, userId: string, data: Partial<InsertCrewMember>): Promise<CrewMember | undefined>;

  // Equipment (Scheduling)
  getEquipment(companyId: string): Promise<Equipment[]>;
  getEquipmentItem(companyId: string, id: string): Promise<Equipment | undefined>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(companyId: string, id: string, data: Partial<InsertEquipment>): Promise<Equipment | undefined>;
  deleteEquipment(companyId: string, id: string): Promise<boolean>;

  // Crew Assignments (Scheduling)
  getCrewAssignments(companyId: string, filters?: { jobId?: string; crewId?: string; date?: Date; startDate?: Date; endDate?: Date }): Promise<CrewAssignment[]>;
  getCrewAssignment(companyId: string, id: string): Promise<CrewAssignment | undefined>;
  createCrewAssignment(assignment: InsertCrewAssignment): Promise<CrewAssignment>;
  updateCrewAssignment(companyId: string, id: string, data: Partial<InsertCrewAssignment>): Promise<CrewAssignment | undefined>;
  deleteCrewAssignment(companyId: string, id: string): Promise<boolean>;

  // Equipment Reservations (Scheduling)
  getEquipmentReservations(companyId: string, filters?: { jobId?: string; equipmentId?: string; date?: Date; startDate?: Date; endDate?: Date }): Promise<EquipmentReservation[]>;
  getEquipmentReservation(companyId: string, id: string): Promise<EquipmentReservation | undefined>;
  createEquipmentReservation(reservation: InsertEquipmentReservation): Promise<EquipmentReservation>;
  updateEquipmentReservation(companyId: string, id: string, data: Partial<InsertEquipmentReservation>): Promise<EquipmentReservation | undefined>;
  deleteEquipmentReservation(companyId: string, id: string): Promise<boolean>;

  // Contract Templates
  getContractTemplates(companyId: string): Promise<ContractTemplate[]>;
  getContractTemplate(companyId: string, id: string): Promise<ContractTemplate | undefined>;
  getDefaultContractTemplate(companyId: string): Promise<ContractTemplate | undefined>;
  createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(companyId: string, id: string, data: Partial<InsertContractTemplate>): Promise<ContractTemplate | undefined>;
  setDefaultContractTemplate(companyId: string, id: string): Promise<void>;

  // Contracts
  getContracts(companyId: string): Promise<Contract[]>;
  getContract(companyId: string, id: string): Promise<Contract | undefined>;
  getContractByEstimateId(companyId: string, estimateId: string): Promise<Contract | undefined>;
  getContractByTokenHash(tokenHash: string): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(companyId: string, id: string, data: Partial<InsertContract>): Promise<Contract | undefined>;
  generateContractNumber(companyId: string): Promise<string>;
  markContractMagicLinkUsed(id: string): Promise<Contract | undefined>;

  // Signed Contract Snapshots (immutable)
  createSignedContractSnapshot(snapshot: InsertSignedContractSnapshot): Promise<SignedContractSnapshot>;
  getSignedContractSnapshot(contractId: string): Promise<SignedContractSnapshot | undefined>;

  // Controlled contract state transitions (bypass immutability guard only for these authorized flows)
  signContract(companyId: string, contractId: string, signatureData: {
    signedAt: Date;
    signerName: string;
    signerInitials?: string | null;
    signatureData?: string | null;
    signerIpAddress?: string | null;
    signerUserAgent?: string | null;
  }): Promise<Contract | undefined>;
  voidContract(companyId: string, contractId: string, reason: string, voidedAt?: Date): Promise<Contract | undefined>;

  // Payment Plans
  getPaymentPlans(companyId: string): Promise<PaymentPlan[]>;
  getPaymentPlan(companyId: string, id: string): Promise<PaymentPlan | undefined>;
  getPaymentPlanByJobId(companyId: string, jobId: string): Promise<PaymentPlan | undefined>;
  getPaymentPlanByTokenHash(tokenHash: string): Promise<PaymentPlan | undefined>;
  createPaymentPlan(plan: InsertPaymentPlan): Promise<PaymentPlan>;
  updatePaymentPlan(companyId: string, id: string, data: Partial<InsertPaymentPlan>): Promise<PaymentPlan | undefined>;
  generatePaymentPlanNumber(companyId: string): Promise<string>;
  updatePaymentPlanLastAccessed(id: string): Promise<void>;

  // Service Requests
  getServiceRequests(companyId: string): Promise<ServiceRequest[]>;
  getServiceRequest(companyId: string, id: string): Promise<ServiceRequest | undefined>;
  getServiceRequestsByPaymentPlanId(paymentPlanId: string): Promise<ServiceRequest[]>;
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  updateServiceRequest(companyId: string, id: string, data: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined>;
  generateServiceRequestNumber(companyId: string): Promise<string>;

  // Pricing Tools
  getPricingTools(companyId: string): Promise<PricingTool[]>;
  getPricingTool(companyId: string, id: string): Promise<PricingTool | undefined>;
  getPricingToolBySlug(companyId: string, slug: string): Promise<PricingTool | undefined>;
  getPublicPricingToolBySlug(slug: string): Promise<(PricingTool & { company: Company }) | undefined>;
  createPricingTool(tool: InsertPricingTool): Promise<PricingTool>;
  updatePricingTool(companyId: string, id: string, data: Partial<InsertPricingTool>): Promise<PricingTool | undefined>;
  deletePricingTool(companyId: string, id: string): Promise<boolean>;
  incrementPricingToolViewCount(id: string): Promise<void>;
  incrementPricingToolSubmissionCount(id: string): Promise<void>;

  // Public Quote Requests
  getPublicQuoteRequests(companyId: string): Promise<PublicQuoteRequest[]>;
  getPublicQuoteRequest(companyId: string, id: string): Promise<PublicQuoteRequest | undefined>;
  createPublicQuoteRequest(request: InsertPublicQuoteRequest): Promise<PublicQuoteRequest>;
  updatePublicQuoteRequest(companyId: string, id: string, data: Partial<InsertPublicQuoteRequest>): Promise<PublicQuoteRequest | undefined>;

  // Lead Sources
  getLeadSources(companyId: string): Promise<LeadSource[]>;
  createLeadSource(source: InsertLeadSource): Promise<LeadSource>;
  updateLeadSource(companyId: string, id: string, data: Partial<InsertLeadSource>): Promise<LeadSource | undefined>;
  deleteLeadSource(companyId: string, id: string): Promise<boolean>;
  createDefaultLeadSources(companyId: string): Promise<LeadSource[]>;

  // Marketing Campaigns
  getMarketingCampaigns(companyId: string): Promise<MarketingCampaign[]>;
  getMarketingCampaign(companyId: string, id: string): Promise<MarketingCampaign | undefined>;
  createMarketingCampaign(campaign: InsertMarketingCampaign): Promise<MarketingCampaign>;
  updateMarketingCampaign(companyId: string, id: string, data: Partial<InsertMarketingCampaign>): Promise<MarketingCampaign | undefined>;
  deleteMarketingCampaign(companyId: string, id: string): Promise<boolean>;

  // Marketing Pages
  getMarketingPages(companyId: string): Promise<MarketingPage[]>;
  getMarketingPage(companyId: string, id: string): Promise<MarketingPage | undefined>;
  getMarketingPageByToken(token: string): Promise<MarketingPage | undefined>;
  createMarketingPage(page: InsertMarketingPage): Promise<MarketingPage>;
  updateMarketingPage(companyId: string, id: string, data: Partial<InsertMarketingPage>): Promise<MarketingPage | undefined>;
  deleteMarketingPage(companyId: string, id: string): Promise<boolean>;
  incrementMarketingPageViewCount(id: string): Promise<void>;
  incrementMarketingPageSubmissionCount(id: string): Promise<void>;

  // Marketing Submissions
  getMarketingSubmissions(companyId: string): Promise<MarketingSubmission[]>;
  getMarketingSubmissionsByPage(pageId: string): Promise<MarketingSubmission[]>;
  createMarketingSubmission(submission: InsertMarketingSubmission): Promise<MarketingSubmission>;
  updateMarketingSubmission(companyId: string, id: string, data: Partial<InsertMarketingSubmission>): Promise<MarketingSubmission | undefined>;

  // Marketing Assets
  getMarketingAssets(companyId: string): Promise<MarketingAsset[]>;
  createMarketingAsset(asset: InsertMarketingAsset): Promise<MarketingAsset>;
  deleteMarketingAsset(companyId: string, id: string): Promise<boolean>;

  // Estimate Tool Config
  getEstimateToolConfig(companyId: string): Promise<EstimateToolConfig | undefined>;
  upsertEstimateToolConfig(config: InsertEstimateToolConfig): Promise<EstimateToolConfig>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getCompanyUsers(companyId: string): Promise<Array<User & { roles: Role[] }>> {
    const companyUsers = await db.select().from(users).where(eq(users.companyId, companyId));
    const usersWithRoles = await Promise.all(
      companyUsers.map(async (user) => {
        const userRolesList = await this.getUserRoles(user.id);
        return { ...user, roles: userRolesList };
      })
    );
    return usersWithRoles;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserCompany(userId: string, companyId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ companyId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getCompanyBySlug(slug: string): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
    return company;
  }

  async createCompany(companyData: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(companyData).returning();
    return company;
  }

  async updateCompany(id: string, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db
      .update(companies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();
    return company;
  }

  async getRoles(companyId: string): Promise<Role[]> {
    return await db.select().from(roles).where(eq(roles.companyId, companyId));
  }

  async getRole(id: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async createRole(roleData: InsertRole): Promise<Role> {
    const [role] = await db.insert(roles).values(roleData).returning();
    return role;
  }

  async updateRole(companyId: string, id: string, data: Partial<InsertRole>): Promise<Role | undefined> {
    const [role] = await db
      .update(roles)
      .set(data)
      .where(and(eq(roles.companyId, companyId), eq(roles.id, id)))
      .returning();
    return role;
  }

  async deleteRole(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(roles)
      .where(and(eq(roles.companyId, companyId), eq(roles.id, id), eq(roles.isSystemRole, false)))
      .returning();
    return result.length > 0;
  }

  async createDefaultRoles(companyId: string): Promise<Role[]> {
    const existingRoles = await this.getRoles(companyId);
    if (existingRoles.length > 0) {
      return existingRoles;
    }
    
    const defaultRoles = [
      { companyId, name: 'Owner', description: 'Full access to all features', isDefault: true, isSystemRole: true },
      { companyId, name: 'Admin', description: 'Administrative access', isDefault: false, isSystemRole: true },
      { companyId, name: 'Manager', description: 'Management access', isDefault: false, isSystemRole: true },
      { companyId, name: 'Employee', description: 'Basic employee access', isDefault: false, isSystemRole: true },
    ];
    const createdRoles = await db.insert(roles).values(defaultRoles).returning();
    return createdRoles;
  }

  async assignUserRole(userId: string, roleId: string, assignedBy?: string): Promise<void> {
    await db.insert(userRoles).values({
      userId,
      roleId,
      assignedBy,
    }).onConflictDoNothing();
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const result = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    return result.map((r) => r.role);
  }

  async getPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions).orderBy(permissions.module, permissions.action);
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const result = await db
      .select({ permission: permissions })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    return result.map((r) => r.permission);
  }

  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionIds.length > 0) {
      await db.insert(rolePermissions).values(
        permissionIds.map((permissionId) => ({ roleId, permissionId }))
      );
    }
  }

  async getCompanySettings(companyId: string): Promise<CompanySettings | undefined> {
    const [settings] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId));
    return settings;
  }

  async upsertCompanySettings(settingsData: InsertCompanySettings): Promise<CompanySettings> {
    const existing = await this.getCompanySettings(settingsData.companyId);
    if (existing) {
      const [updated] = await db
        .update(companySettings)
        .set({ ...settingsData, updatedAt: new Date() })
        .where(eq(companySettings.companyId, settingsData.companyId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(companySettings).values(settingsData).returning();
    return created;
  }

  async getCostProfileSnapshots(companyId: string): Promise<CostProfileSnapshot[]> {
    return await db
      .select()
      .from(costProfileSnapshots)
      .where(eq(costProfileSnapshots.companyId, companyId))
      .orderBy(desc(costProfileSnapshots.version));
  }

  async getLatestCostProfileSnapshot(companyId: string): Promise<CostProfileSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(costProfileSnapshots)
      .where(eq(costProfileSnapshots.companyId, companyId))
      .orderBy(desc(costProfileSnapshots.version))
      .limit(1);
    return snapshot;
  }

  async createCostProfileSnapshot(snapshotData: InsertCostProfileSnapshot): Promise<CostProfileSnapshot> {
    const [snapshot] = await db.insert(costProfileSnapshots).values(snapshotData).returning();
    return snapshot;
  }

  async createAuditLogEntry(entryData: InsertAuditLog): Promise<AuditLog> {
    const [entry] = await db.insert(auditLogs).values(entryData).returning();
    return entry;
  }

  async getAuditLog(companyId: string, limit = 100): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.companyId, companyId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async getCustomers(companyId: string): Promise<Customer[]> {
    return await db.select().from(customers).where(eq(customers.companyId, companyId));
  }

  async getCustomer(companyId: string, id: string): Promise<Customer | undefined> {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.id, id)));
    return customer;
  }

  async createCustomer(customerData: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(customerData).returning();
    return customer;
  }

  async updateCustomer(companyId: string, id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(customers.companyId, companyId), eq(customers.id, id)))
      .returning();
    return customer;
  }

  async deleteCustomer(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(customers)
      .where(and(eq(customers.companyId, companyId), eq(customers.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async getProperties(companyId: string, customerId: string): Promise<Property[]> {
    return await db
      .select()
      .from(properties)
      .where(and(eq(properties.companyId, companyId), eq(properties.customerId, customerId)));
  }

  async createProperty(propertyData: InsertProperty): Promise<Property> {
    const [property] = await db.insert(properties).values(propertyData).returning();
    return property;
  }

  async getProperty(companyId: string, id: string): Promise<Property | undefined> {
    const [property] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.companyId, companyId), eq(properties.id, id)));
    return property;
  }

  async deleteProperty(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(properties)
      .where(and(eq(properties.companyId, companyId), eq(properties.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async getLeads(companyId: string): Promise<Lead[]> {
    return await db.select().from(leads).where(eq(leads.companyId, companyId)).orderBy(desc(leads.createdAt));
  }

  async getLead(companyId: string, id: string): Promise<Lead | undefined> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.id, id)));
    return lead;
  }

  async createLead(leadData: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(leadData).returning();
    return lead;
  }

  async updateLead(companyId: string, id: string, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const [lead] = await db
      .update(leads)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(leads.companyId, companyId), eq(leads.id, id)))
      .returning();
    return lead;
  }

  async deleteLead(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(leads)
      .where(and(eq(leads.companyId, companyId), eq(leads.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async getEstimates(companyId: string): Promise<Estimate[]> {
    return await db.select().from(estimates).where(eq(estimates.companyId, companyId)).orderBy(desc(estimates.createdAt));
  }

  async getEstimate(companyId: string, id: string): Promise<Estimate | undefined> {
    const [estimate] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
    return estimate;
  }

  async getEstimateWithLatestSnapshot(
    companyId: string,
    id: string
  ): Promise<{ estimate: Estimate; latestSnapshot: EstimateSnapshot | null } | undefined> {
    const estimate = await this.getEstimate(companyId, id);
    if (!estimate) return undefined;

    const latestSnapshot = await this.getLatestEstimateSnapshot(companyId, id);
    return { estimate, latestSnapshot: latestSnapshot || null };
  }

  async createEstimate(estimateData: InsertEstimate): Promise<Estimate> {
    const [estimate] = await db.insert(estimates).values(estimateData).returning();
    return estimate;
  }

  async updateEstimate(companyId: string, id: string, data: Partial<InsertEstimate>): Promise<Estimate | undefined> {
    const [estimate] = await db
      .update(estimates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)))
      .returning();
    return estimate;
  }

  async deleteEstimate(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(estimates)
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async getEstimateByTokenHash(tokenHash: string): Promise<Estimate | undefined> {
    const [estimate] = await db
      .select()
      .from(estimates)
      .where(
        and(
          eq(estimates.magicLinkTokenHash, tokenHash),
          gt(estimates.magicLinkExpiresAt, new Date()),
          isNull(estimates.magicLinkUsedAt)
        )
      );
    return estimate;
  }

  async getEstimateByTokenHashForView(tokenHash: string): Promise<Estimate | undefined> {
    const [estimate] = await db
      .select()
      .from(estimates)
      .where(eq(estimates.magicLinkTokenHash, tokenHash));
    return estimate;
  }

  async markMagicLinkUsed(estimateId: string): Promise<Estimate | undefined> {
    const [estimate] = await db
      .update(estimates)
      .set({ magicLinkUsedAt: new Date() })
      .where(eq(estimates.id, estimateId))
      .returning();
    return estimate;
  }

  async generateEstimateNumber(companyId: string): Promise<string> {
    const [latest] = await db
      .select({ estimateNumber: estimates.estimateNumber })
      .from(estimates)
      .where(eq(estimates.companyId, companyId))
      .orderBy(desc(estimates.createdAt))
      .limit(1);

    let maxNumber = 0;
    if (latest?.estimateNumber) {
      const match = latest.estimateNumber.match(/EST-(\d+)/);
      if (match) {
        maxNumber = parseInt(match[1], 10);
      }
    }

    return `EST-${String(maxNumber + 1).padStart(5, '0')}`;
  }

  async createEstimateSnapshot(snapshotData: InsertEstimateSnapshot): Promise<EstimateSnapshot> {
    const [snapshot] = await db.insert(estimateSnapshots).values(snapshotData).returning();
    return snapshot;
  }

  async getEstimateSnapshots(companyId: string, estimateId: string): Promise<EstimateSnapshot[]> {
    const estimate = await this.getEstimate(companyId, estimateId);
    if (!estimate) return [];

    return await db
      .select()
      .from(estimateSnapshots)
      .where(eq(estimateSnapshots.estimateId, estimateId))
      .orderBy(desc(estimateSnapshots.snapshotVersion));
  }

  async getLatestEstimateSnapshot(companyId: string, estimateId: string): Promise<EstimateSnapshot | undefined> {
    const estimate = await this.getEstimate(companyId, estimateId);
    if (!estimate) return undefined;

    const [snapshot] = await db
      .select()
      .from(estimateSnapshots)
      .where(eq(estimateSnapshots.estimateId, estimateId))
      .orderBy(desc(estimateSnapshots.snapshotVersion))
      .limit(1);
    return snapshot;
  }

  async getLatestEstimateSnapshotByEstimateId(estimateId: string): Promise<EstimateSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(estimateSnapshots)
      .where(eq(estimateSnapshots.estimateId, estimateId))
      .orderBy(desc(estimateSnapshots.snapshotVersion))
      .limit(1);
    return snapshot;
  }

  async getNextSnapshotVersion(companyId: string, estimateId: string): Promise<number> {
    const latest = await this.getLatestEstimateSnapshot(companyId, estimateId);
    return latest ? latest.snapshotVersion + 1 : 1;
  }

  async getJobs(companyId: string): Promise<Job[]> {
    return await db.select().from(jobs).where(eq(jobs.companyId, companyId)).orderBy(desc(jobs.createdAt));
  }

  async getJob(companyId: string, id: string): Promise<Job | undefined> {
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.id, id)));
    return job;
  }

  async getJobsByEstimateId(companyId: string, estimateId: string): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, companyId), eq(jobs.estimateId, estimateId)));
  }

  async createJob(jobData: InsertJob): Promise<Job> {
    const [job] = await db.insert(jobs).values(jobData).returning();
    return job;
  }

  async updateJob(companyId: string, id: string, data: Partial<InsertJob>): Promise<Job | undefined> {
    const [job] = await db
      .update(jobs)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(jobs.companyId, companyId), eq(jobs.id, id)))
      .returning();
    return job;
  }

  async canCloseJob(companyId: string, jobId: string): Promise<{ canClose: boolean; reason?: string }> {
    const jobInvoices = await this.getInvoicesByJobId(companyId, jobId);
    
    // Allowable terminal states for job close-out
    const terminalStatuses = ['paid', 'voided', 'refunded'];
    
    const outstandingInvoices = jobInvoices.filter(
      (inv) => !terminalStatuses.includes(inv.status)
    );
    
    if (outstandingInvoices.length > 0) {
      const statusSummary = outstandingInvoices.map((inv) => `${inv.invoiceNumber}: ${inv.status}`).join(', ');
      return {
        canClose: false,
        reason: `${outstandingInvoices.length} invoice(s) have outstanding balances: ${statusSummary}`,
      };
    }
    
    return { canClose: true };
  }

  async canScheduleJob(companyId: string, jobId: string): Promise<{ canSchedule: boolean; reason?: string }> {
    const jobInvoices = await this.getInvoicesByJobId(companyId, jobId);
    
    // Job can be scheduled if it has at least one invoice in sent, partially_paid, or paid status
    // This ensures the customer has received billing information before work is scheduled
    const billedStatuses = ['sent', 'partially_paid', 'paid'];
    
    const billedInvoices = jobInvoices.filter(
      (inv) => billedStatuses.includes(inv.status)
    );
    
    if (billedInvoices.length === 0) {
      if (jobInvoices.length === 0) {
        return {
          canSchedule: false,
          reason: 'No invoices have been created for this job. Create and send an invoice before scheduling.',
        };
      }
      const draftInvoices = jobInvoices.filter((inv) => inv.status === 'draft');
      if (draftInvoices.length > 0) {
        return {
          canSchedule: false,
          reason: `${draftInvoices.length} draft invoice(s) exist but none have been sent. Send an invoice before scheduling.`,
        };
      }
      return {
        canSchedule: false,
        reason: 'No invoices have been sent to the customer. Send an invoice before scheduling.',
      };
    }
    
    return { canSchedule: true };
  }

  async getInvoices(companyId: string): Promise<Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.companyId, companyId)).orderBy(desc(invoices.createdAt));
  }

  async getInvoice(companyId: string, id: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)));
    return invoice;
  }

  async createInvoice(invoiceData: InsertInvoice): Promise<Invoice> {
    const [invoice] = await db.insert(invoices).values(invoiceData).returning();
    return invoice;
  }

  async updateInvoice(companyId: string, id: string, data: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    const [invoice] = await db
      .update(invoices)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)))
      .returning();
    return invoice;
  }

  async updateInvoiceWithVersionCheck(
    companyId: string, 
    id: string, 
    expectedVersion: number, 
    data: Partial<InsertInvoice>
  ): Promise<{ success: boolean; invoice?: Invoice; currentVersion?: number }> {
    const result = await db
      .update(invoices)
      .set({ 
        ...data, 
        updatedAt: new Date(),
        version: expectedVersion + 1
      })
      .where(and(
        eq(invoices.companyId, companyId), 
        eq(invoices.id, id),
        eq(invoices.version, expectedVersion)
      ))
      .returning();
    
    if (result.length === 0) {
      const [current] = await db
        .select({ version: invoices.version })
        .from(invoices)
        .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)));
      return { success: false, currentVersion: current?.version };
    }
    
    return { success: true, invoice: result[0] };
  }

  async generateInvoiceNumber(companyId: string): Promise<string> {
    const [latest] = await db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.companyId, companyId))
      .orderBy(desc(invoices.createdAt))
      .limit(1);

    let maxNumber = 0;
    if (latest?.invoiceNumber) {
      const match = latest.invoiceNumber.match(/INV-(\d+)/);
      if (match) {
        maxNumber = parseInt(match[1], 10);
      }
    }

    return `INV-${String(maxNumber + 1).padStart(5, '0')}`;
  }

  async getInvoicesByEstimateId(companyId: string, estimateId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.estimateId, estimateId)));
  }

  async getInvoicesByJobId(companyId: string, jobId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId)));
  }

  async getInvoiceByTokenHashForView(tokenHash: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.magicLinkTokenHash, tokenHash));
    return invoice;
  }

  async getPayments(companyId: string, invoiceId: string): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(and(
        eq(payments.companyId, companyId),
        eq(payments.invoiceId, invoiceId)
      ))
      .orderBy(desc(payments.createdAt));
  }

  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(paymentData).returning();
    return payment;
  }

  async updatePayment(companyId: string, id: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [payment] = await db
      .update(payments)
      .set(data)
      .where(and(eq(payments.companyId, companyId), eq(payments.id, id)))
      .returning();
    return payment;
  }

  async recordOfflinePaymentTransactional(
    companyId: string,
    invoiceId: string,
    expectedVersion: number,
    paymentData: InsertPayment,
    invoiceUpdates: { amountPaid: string; amountDue: string }
  ): Promise<{ success: true; payment: Payment; invoice: Invoice } | { success: false; error: string; currentVersion?: number }> {
    try {
      return await db.transaction(async (tx) => {
        const versionCheckResult = await tx
          .update(invoices)
          .set({ 
            ...invoiceUpdates, 
            updatedAt: new Date(),
            version: expectedVersion + 1
          })
          .where(and(
            eq(invoices.companyId, companyId), 
            eq(invoices.id, invoiceId),
            eq(invoices.version, expectedVersion)
          ))
          .returning();
        
        if (versionCheckResult.length === 0) {
          const [current] = await tx
            .select({ version: invoices.version })
            .from(invoices)
            .where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)));
          
          throw { type: 'version_conflict', currentVersion: current?.version };
        }

        const [payment] = await tx.insert(payments).values(paymentData).returning();

        return { success: true as const, payment, invoice: versionCheckResult[0] };
      });
    } catch (error: any) {
      if (error?.type === 'version_conflict') {
        return { success: false, error: 'Concurrent modification detected', currentVersion: error.currentVersion };
      }
      throw error;
    }
  }

  async getInvoiceAllocations(invoiceId: string): Promise<InvoiceAllocation[]> {
    return await db
      .select()
      .from(invoiceAllocations)
      .where(eq(invoiceAllocations.invoiceId, invoiceId));
  }

  async getInvoiceByStripeCheckoutSessionId(sessionId: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.stripeCheckoutSessionId, sessionId));
    return invoice;
  }

  async getPaymentByStripePaymentIntentId(paymentIntentId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePaymentIntentId, paymentIntentId));
    return payment;
  }

  async getPaymentPlanTemplates(companyId: string): Promise<PaymentPlanTemplate[]> {
    return await db
      .select()
      .from(paymentPlanTemplates)
      .where(eq(paymentPlanTemplates.companyId, companyId))
      .orderBy(desc(paymentPlanTemplates.createdAt));
  }

  async getPaymentPlanTemplate(companyId: string, id: string): Promise<PaymentPlanTemplate | undefined> {
    const [template] = await db
      .select()
      .from(paymentPlanTemplates)
      .where(and(eq(paymentPlanTemplates.companyId, companyId), eq(paymentPlanTemplates.id, id)));
    return template;
  }

  async getDefaultPaymentPlanTemplate(companyId: string): Promise<PaymentPlanTemplate | undefined> {
    const [template] = await db
      .select()
      .from(paymentPlanTemplates)
      .where(
        and(
          eq(paymentPlanTemplates.companyId, companyId),
          eq(paymentPlanTemplates.isDefault, true),
          eq(paymentPlanTemplates.isActive, true)
        )
      );
    return template;
  }

  async createPaymentPlanTemplate(templateData: InsertPaymentPlanTemplate): Promise<PaymentPlanTemplate> {
    const [template] = await db.insert(paymentPlanTemplates).values(templateData).returning();
    return template;
  }

  async updatePaymentPlanTemplate(
    companyId: string,
    id: string,
    data: Partial<InsertPaymentPlanTemplate>
  ): Promise<PaymentPlanTemplate | undefined> {
    const [template] = await db
      .update(paymentPlanTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(paymentPlanTemplates.companyId, companyId), eq(paymentPlanTemplates.id, id)))
      .returning();
    return template;
  }

  async setDefaultPaymentPlanTemplate(companyId: string, id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentPlanTemplates)
        .set({ isDefault: false })
        .where(eq(paymentPlanTemplates.companyId, companyId));

      await tx
        .update(paymentPlanTemplates)
        .set({ isDefault: true })
        .where(and(eq(paymentPlanTemplates.companyId, companyId), eq(paymentPlanTemplates.id, id)));
    });
  }

  async getStripeEvent(eventId: string): Promise<StripeEvent | undefined> {
    const [event] = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, eventId));
    return event;
  }

  async createStripeEvent(eventData: InsertStripeEvent): Promise<StripeEvent> {
    const [event] = await db.insert(stripeEvents).values(eventData).returning();
    return event;
  }

  // ============================================================================
  // CREWS (SCHEDULING)
  // ============================================================================
  async getCrews(companyId: string): Promise<Crew[]> {
    return await db.select().from(crews).where(eq(crews.companyId, companyId)).orderBy(crews.name);
  }

  async getCrew(companyId: string, id: string): Promise<Crew | undefined> {
    const [crew] = await db
      .select()
      .from(crews)
      .where(and(eq(crews.companyId, companyId), eq(crews.id, id)));
    return crew;
  }

  async createCrew(crewData: InsertCrew): Promise<Crew> {
    const [crew] = await db.insert(crews).values(crewData).returning();
    return crew;
  }

  async updateCrew(companyId: string, id: string, data: Partial<InsertCrew>): Promise<Crew | undefined> {
    const [crew] = await db
      .update(crews)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(crews.companyId, companyId), eq(crews.id, id)))
      .returning();
    return crew;
  }

  async deleteCrew(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(crews)
      .where(and(eq(crews.companyId, companyId), eq(crews.id, id)))
      .returning();
    return result.length > 0;
  }

  // ============================================================================
  // CREW MEMBERS (SCHEDULING)
  // ============================================================================
  async getCrewMembers(crewId: string): Promise<CrewMember[]> {
    return await db.select().from(crewMembers).where(eq(crewMembers.crewId, crewId));
  }

  async addCrewMember(memberData: InsertCrewMember): Promise<CrewMember> {
    const [member] = await db.insert(crewMembers).values(memberData).returning();
    return member;
  }

  async removeCrewMember(crewId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(crewMembers)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async updateCrewMember(crewId: string, userId: string, data: Partial<InsertCrewMember>): Promise<CrewMember | undefined> {
    const [member] = await db
      .update(crewMembers)
      .set(data)
      .where(and(eq(crewMembers.crewId, crewId), eq(crewMembers.userId, userId)))
      .returning();
    return member;
  }

  // ============================================================================
  // EQUIPMENT (SCHEDULING)
  // ============================================================================
  async getEquipment(companyId: string): Promise<Equipment[]> {
    return await db.select().from(equipment).where(eq(equipment.companyId, companyId)).orderBy(equipment.name);
  }

  async getEquipmentItem(companyId: string, id: string): Promise<Equipment | undefined> {
    const [item] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.companyId, companyId), eq(equipment.id, id)));
    return item;
  }

  async createEquipment(equipmentData: InsertEquipment): Promise<Equipment> {
    const [item] = await db.insert(equipment).values(equipmentData).returning();
    return item;
  }

  async updateEquipment(companyId: string, id: string, data: Partial<InsertEquipment>): Promise<Equipment | undefined> {
    const [item] = await db
      .update(equipment)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(equipment.companyId, companyId), eq(equipment.id, id)))
      .returning();
    return item;
  }

  async deleteEquipment(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(equipment)
      .where(and(eq(equipment.companyId, companyId), eq(equipment.id, id)))
      .returning();
    return result.length > 0;
  }

  // ============================================================================
  // CREW ASSIGNMENTS (SCHEDULING)
  // ============================================================================
  async getCrewAssignments(
    companyId: string,
    filters?: { jobId?: string; crewId?: string; date?: Date; startDate?: Date; endDate?: Date }
  ): Promise<CrewAssignment[]> {
    const conditions = [eq(crewAssignments.companyId, companyId)];
    
    if (filters?.jobId) {
      conditions.push(eq(crewAssignments.jobId, filters.jobId));
    }
    if (filters?.crewId) {
      conditions.push(eq(crewAssignments.crewId, filters.crewId));
    }
    if (filters?.date) {
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(sql`${crewAssignments.scheduledDate} >= ${startOfDay} AND ${crewAssignments.scheduledDate} <= ${endOfDay}`);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      conditions.push(sql`${crewAssignments.scheduledDate} >= ${start}`);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(sql`${crewAssignments.scheduledDate} <= ${end}`);
    }

    return await db
      .select()
      .from(crewAssignments)
      .where(and(...conditions))
      .orderBy(crewAssignments.scheduledDate);
  }

  async getCrewAssignment(companyId: string, id: string): Promise<CrewAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(crewAssignments)
      .where(and(eq(crewAssignments.companyId, companyId), eq(crewAssignments.id, id)));
    return assignment;
  }

  async createCrewAssignment(assignmentData: InsertCrewAssignment): Promise<CrewAssignment> {
    const [assignment] = await db.insert(crewAssignments).values(assignmentData).returning();
    return assignment;
  }

  async updateCrewAssignment(
    companyId: string,
    id: string,
    data: Partial<InsertCrewAssignment>
  ): Promise<CrewAssignment | undefined> {
    const [assignment] = await db
      .update(crewAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(crewAssignments.companyId, companyId), eq(crewAssignments.id, id)))
      .returning();
    return assignment;
  }

  async deleteCrewAssignment(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(crewAssignments)
      .where(and(eq(crewAssignments.companyId, companyId), eq(crewAssignments.id, id)))
      .returning();
    return result.length > 0;
  }

  // ============================================================================
  // EQUIPMENT RESERVATIONS (SCHEDULING)
  // ============================================================================
  async getEquipmentReservations(
    companyId: string,
    filters?: { jobId?: string; equipmentId?: string; date?: Date; startDate?: Date; endDate?: Date }
  ): Promise<EquipmentReservation[]> {
    const conditions = [eq(equipmentReservations.companyId, companyId)];
    if (filters?.jobId) {
      conditions.push(eq(equipmentReservations.jobId, filters.jobId));
    }
    if (filters?.equipmentId) {
      conditions.push(eq(equipmentReservations.equipmentId, filters.equipmentId));
    }
    if (filters?.date) {
      const startOfDay = new Date(filters.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filters.date);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(sql`${equipmentReservations.scheduledDate} >= ${startOfDay} AND ${equipmentReservations.scheduledDate} <= ${endOfDay}`);
    }
    if (filters?.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      conditions.push(sql`${equipmentReservations.scheduledDate} >= ${start}`);
    }
    if (filters?.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(sql`${equipmentReservations.scheduledDate} <= ${end}`);
    }

    return await db
      .select()
      .from(equipmentReservations)
      .where(and(...conditions))
      .orderBy(equipmentReservations.scheduledDate);
  }

  async getEquipmentReservation(companyId: string, id: string): Promise<EquipmentReservation | undefined> {
    const [reservation] = await db
      .select()
      .from(equipmentReservations)
      .where(and(eq(equipmentReservations.companyId, companyId), eq(equipmentReservations.id, id)));
    return reservation;
  }

  async createEquipmentReservation(reservationData: InsertEquipmentReservation): Promise<EquipmentReservation> {
    const [reservation] = await db.insert(equipmentReservations).values(reservationData).returning();
    return reservation;
  }

  async updateEquipmentReservation(
    companyId: string,
    id: string,
    data: Partial<InsertEquipmentReservation>
  ): Promise<EquipmentReservation | undefined> {
    const [reservation] = await db
      .update(equipmentReservations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(equipmentReservations.companyId, companyId), eq(equipmentReservations.id, id)))
      .returning();
    return reservation;
  }

  async deleteEquipmentReservation(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(equipmentReservations)
      .where(and(eq(equipmentReservations.companyId, companyId), eq(equipmentReservations.id, id)))
      .returning();
    return result.length > 0;
  }

  // ============================================================================
  // CONTRACT TEMPLATES
  // ============================================================================
  async getContractTemplates(companyId: string): Promise<ContractTemplate[]> {
    return await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.companyId, companyId))
      .orderBy(desc(contractTemplates.isDefault), contractTemplates.name);
  }

  async getContractTemplate(companyId: string, id: string): Promise<ContractTemplate | undefined> {
    const [template] = await db
      .select()
      .from(contractTemplates)
      .where(and(eq(contractTemplates.companyId, companyId), eq(contractTemplates.id, id)));
    return template;
  }

  async getDefaultContractTemplate(companyId: string): Promise<ContractTemplate | undefined> {
    const [template] = await db
      .select()
      .from(contractTemplates)
      .where(and(
        eq(contractTemplates.companyId, companyId),
        eq(contractTemplates.isDefault, true),
        eq(contractTemplates.isActive, true)
      ));
    return template;
  }

  async createContractTemplate(templateData: InsertContractTemplate): Promise<ContractTemplate> {
    const [template] = await db.insert(contractTemplates).values(templateData).returning();
    return template;
  }

  async updateContractTemplate(
    companyId: string,
    id: string,
    data: Partial<InsertContractTemplate>
  ): Promise<ContractTemplate | undefined> {
    const [template] = await db
      .update(contractTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(contractTemplates.companyId, companyId), eq(contractTemplates.id, id)))
      .returning();
    return template;
  }

  async setDefaultContractTemplate(companyId: string, id: string): Promise<void> {
    await db
      .update(contractTemplates)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(contractTemplates.companyId, companyId));
    
    await db
      .update(contractTemplates)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(contractTemplates.companyId, companyId), eq(contractTemplates.id, id)));
  }

  // ============================================================================
  // CONTRACTS
  // ============================================================================
  async getContracts(companyId: string): Promise<Contract[]> {
    return await db
      .select()
      .from(contracts)
      .where(eq(contracts.companyId, companyId))
      .orderBy(desc(contracts.createdAt));
  }

  async getContract(companyId: string, id: string): Promise<Contract | undefined> {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)));
    return contract;
  }

  async getContractByEstimateId(companyId: string, estimateId: string): Promise<Contract | undefined> {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), eq(contracts.estimateId, estimateId)));
    return contract;
  }

  async getContractByTokenHash(tokenHash: string): Promise<Contract | undefined> {
    const [contract] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.magicLinkTokenHash, tokenHash));
    return contract;
  }

  async createContract(contractData: InsertContract): Promise<Contract> {
    const [contract] = await db.insert(contracts).values(contractData).returning();
    return contract;
  }

  async updateContract(
    companyId: string,
    id: string,
    data: Partial<InsertContract>,
  ): Promise<Contract | undefined> {
    // Status guard: signed contracts are immutable
    // For state transitions (signing, voiding), use dedicated signContract/voidContract methods
    const existing = await this.getContract(companyId, id);
    if (!existing) return undefined;
    
    if (existing.status === 'signed') {
      throw new Error('Cannot modify a signed contract. Signed contracts are immutable. Use voidContract() if needed.');
    }
    
    if (existing.lockedAt) {
      throw new Error('Cannot modify a locked contract.');
    }

    const [contract] = await db
      .update(contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(contracts.companyId, companyId), eq(contracts.id, id)))
      .returning();
    return contract;
  }

  async generateContractNumber(companyId: string): Promise<string> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contracts)
      .where(eq(contracts.companyId, companyId));
    const count = Number(result[0]?.count || 0) + 1;
    const year = new Date().getFullYear();
    return `C-${year}-${count.toString().padStart(4, '0')}`;
  }

  async markContractMagicLinkUsed(id: string): Promise<Contract | undefined> {
    const [contract] = await db
      .update(contracts)
      .set({ magicLinkUsedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(contracts.id, id), isNull(contracts.magicLinkUsedAt)))
      .returning();
    return contract;
  }

  // Signed Contract Snapshots (immutable, append-only)
  async createSignedContractSnapshot(snapshotData: InsertSignedContractSnapshot): Promise<SignedContractSnapshot> {
    const [snapshot] = await db.insert(signedContractSnapshots).values(snapshotData).returning();
    return snapshot;
  }

  async getSignedContractSnapshot(contractId: string): Promise<SignedContractSnapshot | undefined> {
    const [snapshot] = await db
      .select()
      .from(signedContractSnapshots)
      .where(eq(signedContractSnapshots.contractId, contractId));
    return snapshot;
  }

  // Controlled contract state transitions (bypass immutability guard only for these authorized flows)
  async signContract(companyId: string, contractId: string, signatureData: {
    signedAt: Date;
    signerName: string;
    signerInitials?: string | null;
    signatureData?: string | null;
    signerIpAddress?: string | null;
    signerUserAgent?: string | null;
  }): Promise<Contract | undefined> {
    const contract = await this.getContract(companyId, contractId);
    if (!contract) return undefined;

    // Only allow signing from 'sent' status
    if (contract.status !== "sent") {
      throw new Error(`Cannot sign contract with status '${contract.status}'. Contract must be in 'sent' status.`);
    }

    const [updated] = await db
      .update(contracts)
      .set({
        status: "signed",
        signedAt: signatureData.signedAt,
        signerName: signatureData.signerName,
        signerInitials: signatureData.signerInitials,
        signatureData: signatureData.signatureData,
        signerIpAddress: signatureData.signerIpAddress,
        signerUserAgent: signatureData.signerUserAgent,
        lockedAt: new Date(), // Lock immediately on signing
      })
      .where(
        and(
          eq(contracts.id, contractId),
          eq(contracts.companyId, companyId),
          eq(contracts.status, "sent"), // Double-check status hasn't changed
        ),
      )
      .returning();

    return updated;
  }

  async voidContract(companyId: string, contractId: string, reason: string, voidedAt?: Date): Promise<Contract | undefined> {
    const contract = await this.getContract(companyId, contractId);
    if (!contract) return undefined;

    // Cannot void an already voided contract
    if (contract.status === "voided") {
      throw new Error("Contract is already voided");
    }

    // Cannot void expired contracts
    if (contract.status === "expired") {
      throw new Error("Cannot void an expired contract");
    }

    const [updated] = await db
      .update(contracts)
      .set({
        status: "voided",
        voidedAt: voidedAt || new Date(),
        voidedReason: reason.trim(),
      })
      .where(
        and(
          eq(contracts.id, contractId),
          eq(contracts.companyId, companyId),
        ),
      )
      .returning();

    return updated;
  }

  // Payment Plans
  async getPaymentPlans(companyId: string): Promise<PaymentPlan[]> {
    return db
      .select()
      .from(paymentPlans)
      .where(eq(paymentPlans.companyId, companyId))
      .orderBy(desc(paymentPlans.createdAt));
  }

  async getPaymentPlan(companyId: string, id: string): Promise<PaymentPlan | undefined> {
    const [plan] = await db
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.companyId, companyId), eq(paymentPlans.id, id)));
    return plan;
  }

  async getPaymentPlanByJobId(companyId: string, jobId: string): Promise<PaymentPlan | undefined> {
    const [plan] = await db
      .select()
      .from(paymentPlans)
      .where(and(eq(paymentPlans.companyId, companyId), eq(paymentPlans.jobId, jobId)));
    return plan;
  }

  async getPaymentPlanByTokenHash(tokenHash: string): Promise<PaymentPlan | undefined> {
    const [plan] = await db
      .select()
      .from(paymentPlans)
      .where(eq(paymentPlans.magicLinkTokenHash, tokenHash));
    return plan;
  }

  async createPaymentPlan(planData: InsertPaymentPlan): Promise<PaymentPlan> {
    const [plan] = await db.insert(paymentPlans).values(planData).returning();
    return plan;
  }

  async updatePaymentPlan(
    companyId: string,
    id: string,
    data: Partial<InsertPaymentPlan>
  ): Promise<PaymentPlan | undefined> {
    const [plan] = await db
      .update(paymentPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(paymentPlans.companyId, companyId), eq(paymentPlans.id, id)))
      .returning();
    return plan;
  }

  async generatePaymentPlanNumber(companyId: string): Promise<string> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(paymentPlans)
      .where(eq(paymentPlans.companyId, companyId));
    const count = Number(result[0]?.count || 0) + 1;
    const year = new Date().getFullYear();
    return `PP-${year}-${count.toString().padStart(4, '0')}`;
  }

  async updatePaymentPlanLastAccessed(id: string): Promise<void> {
    await db
      .update(paymentPlans)
      .set({ magicLinkLastAccessedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentPlans.id, id));
  }

  // Service Requests
  async getServiceRequests(companyId: string): Promise<ServiceRequest[]> {
    return db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.companyId, companyId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async getServiceRequest(companyId: string, id: string): Promise<ServiceRequest | undefined> {
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(and(eq(serviceRequests.companyId, companyId), eq(serviceRequests.id, id)));
    return request;
  }

  async getServiceRequestsByPaymentPlanId(paymentPlanId: string): Promise<ServiceRequest[]> {
    return db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.paymentPlanId, paymentPlanId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async createServiceRequest(requestData: InsertServiceRequest): Promise<ServiceRequest> {
    const [request] = await db.insert(serviceRequests).values(requestData).returning();
    return request;
  }

  async updateServiceRequest(
    companyId: string,
    id: string,
    data: Partial<InsertServiceRequest>
  ): Promise<ServiceRequest | undefined> {
    const [request] = await db
      .update(serviceRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(serviceRequests.companyId, companyId), eq(serviceRequests.id, id)))
      .returning();
    return request;
  }

  async generateServiceRequestNumber(companyId: string): Promise<string> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(serviceRequests)
      .where(eq(serviceRequests.companyId, companyId));
    const count = Number(result[0]?.count || 0) + 1;
    const year = new Date().getFullYear();
    return `SR-${year}-${count.toString().padStart(4, '0')}`;
  }

  // Pricing Tools
  async getPricingTools(companyId: string): Promise<PricingTool[]> {
    return db
      .select()
      .from(pricingTools)
      .where(eq(pricingTools.companyId, companyId))
      .orderBy(desc(pricingTools.createdAt));
  }

  async getPricingTool(companyId: string, id: string): Promise<PricingTool | undefined> {
    const [tool] = await db
      .select()
      .from(pricingTools)
      .where(and(eq(pricingTools.companyId, companyId), eq(pricingTools.id, id)));
    return tool;
  }

  async getPricingToolBySlug(companyId: string, slug: string): Promise<PricingTool | undefined> {
    const [tool] = await db
      .select()
      .from(pricingTools)
      .where(and(eq(pricingTools.companyId, companyId), eq(pricingTools.slug, slug)));
    return tool;
  }

  async getPublicPricingToolBySlug(slug: string): Promise<(PricingTool & { company: Company }) | undefined> {
    const [result] = await db
      .select()
      .from(pricingTools)
      .innerJoin(companies, eq(pricingTools.companyId, companies.id))
      .where(
        and(
          eq(pricingTools.slug, slug),
          eq(pricingTools.isActive, true),
          eq(pricingTools.isPublic, true),
          eq(companies.isActive, true)
        )
      );
    if (!result) return undefined;
    return { ...result.pricing_tools, company: result.companies };
  }

  async createPricingTool(toolData: InsertPricingTool): Promise<PricingTool> {
    const [tool] = await db.insert(pricingTools).values(toolData).returning();
    return tool;
  }

  async updatePricingTool(
    companyId: string,
    id: string,
    data: Partial<InsertPricingTool>
  ): Promise<PricingTool | undefined> {
    const [tool] = await db
      .update(pricingTools)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(pricingTools.companyId, companyId), eq(pricingTools.id, id)))
      .returning();
    return tool;
  }

  async deletePricingTool(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(pricingTools)
      .where(and(eq(pricingTools.companyId, companyId), eq(pricingTools.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async incrementPricingToolViewCount(id: string): Promise<void> {
    await db
      .update(pricingTools)
      .set({ viewCount: sql`${pricingTools.viewCount} + 1` })
      .where(eq(pricingTools.id, id));
  }

  async incrementPricingToolSubmissionCount(id: string): Promise<void> {
    await db
      .update(pricingTools)
      .set({ submissionCount: sql`${pricingTools.submissionCount} + 1` })
      .where(eq(pricingTools.id, id));
  }

  // Public Quote Requests
  async getPublicQuoteRequests(companyId: string): Promise<PublicQuoteRequest[]> {
    return db
      .select()
      .from(publicQuoteRequests)
      .where(eq(publicQuoteRequests.companyId, companyId))
      .orderBy(desc(publicQuoteRequests.createdAt));
  }

  async getPublicQuoteRequest(companyId: string, id: string): Promise<PublicQuoteRequest | undefined> {
    const [request] = await db
      .select()
      .from(publicQuoteRequests)
      .where(and(eq(publicQuoteRequests.companyId, companyId), eq(publicQuoteRequests.id, id)));
    return request;
  }

  async createPublicQuoteRequest(requestData: InsertPublicQuoteRequest): Promise<PublicQuoteRequest> {
    const [request] = await db.insert(publicQuoteRequests).values(requestData).returning();
    return request;
  }

  async updatePublicQuoteRequest(
    companyId: string,
    id: string,
    data: Partial<InsertPublicQuoteRequest>
  ): Promise<PublicQuoteRequest | undefined> {
    const [request] = await db
      .update(publicQuoteRequests)
      .set(data)
      .where(and(eq(publicQuoteRequests.companyId, companyId), eq(publicQuoteRequests.id, id)))
      .returning();
    return request;
  }

  // Lead Sources
  async getLeadSources(companyId: string): Promise<LeadSource[]> {
    return db
      .select()
      .from(leadSources)
      .where(eq(leadSources.companyId, companyId))
      .orderBy(leadSources.sortOrder);
  }

  async createLeadSource(sourceData: InsertLeadSource): Promise<LeadSource> {
    const [source] = await db.insert(leadSources).values(sourceData).returning();
    return source;
  }

  async updateLeadSource(
    companyId: string,
    id: string,
    data: Partial<InsertLeadSource>
  ): Promise<LeadSource | undefined> {
    const [source] = await db
      .update(leadSources)
      .set(data)
      .where(and(eq(leadSources.companyId, companyId), eq(leadSources.id, id)))
      .returning();
    return source;
  }

  async deleteLeadSource(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(leadSources)
      .where(and(eq(leadSources.companyId, companyId), eq(leadSources.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async createDefaultLeadSources(companyId: string): Promise<LeadSource[]> {
    const existing = await this.getLeadSources(companyId);
    if (existing.length > 0) {
      return existing;
    }

    const defaultSources = [
      { companyId, name: 'Google', sortOrder: 1, isDefault: true },
      { companyId, name: 'Facebook', sortOrder: 2 },
      { companyId, name: 'Instagram', sortOrder: 3 },
      { companyId, name: 'Website', sortOrder: 4 },
      { companyId, name: 'Referral', sortOrder: 5 },
      { companyId, name: 'Yard Sign', sortOrder: 6 },
      { companyId, name: 'Storm', sortOrder: 7 },
      { companyId, name: 'Other', sortOrder: 8 },
    ];
    const created = await db.insert(leadSources).values(defaultSources).returning();
    return created;
  }

  // Marketing Campaigns
  async getMarketingCampaigns(companyId: string): Promise<MarketingCampaign[]> {
    return db
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.companyId, companyId))
      .orderBy(desc(marketingCampaigns.createdAt));
  }

  async getMarketingCampaign(companyId: string, id: string): Promise<MarketingCampaign | undefined> {
    const [campaign] = await db
      .select()
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.companyId, companyId), eq(marketingCampaigns.id, id)));
    return campaign;
  }

  async createMarketingCampaign(campaignData: InsertMarketingCampaign): Promise<MarketingCampaign> {
    const [campaign] = await db.insert(marketingCampaigns).values(campaignData).returning();
    return campaign;
  }

  async updateMarketingCampaign(
    companyId: string,
    id: string,
    data: Partial<InsertMarketingCampaign>
  ): Promise<MarketingCampaign | undefined> {
    const [campaign] = await db
      .update(marketingCampaigns)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(marketingCampaigns.companyId, companyId), eq(marketingCampaigns.id, id)))
      .returning();
    return campaign;
  }

  async deleteMarketingCampaign(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(marketingCampaigns)
      .where(and(eq(marketingCampaigns.companyId, companyId), eq(marketingCampaigns.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Marketing Pages
  async getMarketingPages(companyId: string): Promise<MarketingPage[]> {
    return db
      .select()
      .from(marketingPages)
      .where(eq(marketingPages.companyId, companyId))
      .orderBy(desc(marketingPages.createdAt));
  }

  async getMarketingPage(companyId: string, id: string): Promise<MarketingPage | undefined> {
    const [page] = await db
      .select()
      .from(marketingPages)
      .where(and(eq(marketingPages.companyId, companyId), eq(marketingPages.id, id)));
    return page;
  }

  async getMarketingPageByToken(token: string): Promise<MarketingPage | undefined> {
    const [page] = await db
      .select()
      .from(marketingPages)
      .where(eq(marketingPages.magicToken, token));
    return page;
  }

  async createMarketingPage(pageData: InsertMarketingPage): Promise<MarketingPage> {
    const [page] = await db.insert(marketingPages).values(pageData).returning();
    return page;
  }

  async updateMarketingPage(
    companyId: string,
    id: string,
    data: Partial<InsertMarketingPage>
  ): Promise<MarketingPage | undefined> {
    const [page] = await db
      .update(marketingPages)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(marketingPages.companyId, companyId), eq(marketingPages.id, id)))
      .returning();
    return page;
  }

  async deleteMarketingPage(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(marketingPages)
      .where(and(eq(marketingPages.companyId, companyId), eq(marketingPages.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  async incrementMarketingPageViewCount(id: string): Promise<void> {
    await db
      .update(marketingPages)
      .set({ viewCount: sql`${marketingPages.viewCount} + 1` })
      .where(eq(marketingPages.id, id));
  }

  async incrementMarketingPageSubmissionCount(id: string): Promise<void> {
    await db
      .update(marketingPages)
      .set({ submissionCount: sql`${marketingPages.submissionCount} + 1` })
      .where(eq(marketingPages.id, id));
  }

  // Marketing Submissions
  async getMarketingSubmissions(companyId: string): Promise<MarketingSubmission[]> {
    return db
      .select()
      .from(marketingSubmissions)
      .where(eq(marketingSubmissions.companyId, companyId))
      .orderBy(desc(marketingSubmissions.submittedAt));
  }

  async getMarketingSubmissionsByPage(pageId: string): Promise<MarketingSubmission[]> {
    return db
      .select()
      .from(marketingSubmissions)
      .where(eq(marketingSubmissions.pageId, pageId))
      .orderBy(desc(marketingSubmissions.submittedAt));
  }

  async createMarketingSubmission(submissionData: InsertMarketingSubmission): Promise<MarketingSubmission> {
    const [submission] = await db.insert(marketingSubmissions).values(submissionData).returning();
    return submission;
  }

  async updateMarketingSubmission(
    companyId: string,
    id: string,
    data: Partial<InsertMarketingSubmission>
  ): Promise<MarketingSubmission | undefined> {
    const [submission] = await db
      .update(marketingSubmissions)
      .set(data)
      .where(and(eq(marketingSubmissions.companyId, companyId), eq(marketingSubmissions.id, id)))
      .returning();
    return submission;
  }

  // Marketing Assets
  async getMarketingAssets(companyId: string): Promise<MarketingAsset[]> {
    return db
      .select()
      .from(marketingAssets)
      .where(eq(marketingAssets.companyId, companyId))
      .orderBy(desc(marketingAssets.createdAt));
  }

  async createMarketingAsset(assetData: InsertMarketingAsset): Promise<MarketingAsset> {
    const [asset] = await db.insert(marketingAssets).values(assetData).returning();
    return asset;
  }

  async deleteMarketingAsset(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(marketingAssets)
      .where(and(eq(marketingAssets.companyId, companyId), eq(marketingAssets.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Estimate Fields (Configurable Field Registry)
  async getEstimateFields(companyId: string): Promise<EstimateField[]> {
    return db
      .select()
      .from(estimateFields)
      .where(eq(estimateFields.companyId, companyId))
      .orderBy(estimateFields.sortOrder);
  }

  async getEstimateField(companyId: string, id: string): Promise<EstimateField | undefined> {
    const [field] = await db
      .select()
      .from(estimateFields)
      .where(and(eq(estimateFields.companyId, companyId), eq(estimateFields.id, id)));
    return field;
  }

  async createEstimateField(fieldData: InsertEstimateField): Promise<EstimateField> {
    const [field] = await db.insert(estimateFields).values(fieldData).returning();
    return field;
  }

  async updateEstimateField(
    companyId: string,
    id: string,
    data: Partial<InsertEstimateField>
  ): Promise<EstimateField | undefined> {
    const [field] = await db
      .update(estimateFields)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(estimateFields.companyId, companyId), eq(estimateFields.id, id)))
      .returning();
    return field;
  }

  async deleteEstimateField(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(estimateFields)
      .where(and(eq(estimateFields.companyId, companyId), eq(estimateFields.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Pricing Profiles
  async getPricingProfiles(companyId: string): Promise<PricingProfile[]> {
    return db
      .select()
      .from(pricingProfiles)
      .where(eq(pricingProfiles.companyId, companyId))
      .orderBy(desc(pricingProfiles.isDefault), pricingProfiles.name);
  }

  async getPricingProfile(companyId: string, id: string): Promise<PricingProfile | undefined> {
    const [profile] = await db
      .select()
      .from(pricingProfiles)
      .where(and(eq(pricingProfiles.companyId, companyId), eq(pricingProfiles.id, id)));
    return profile;
  }

  async getDefaultPricingProfile(companyId: string): Promise<PricingProfile | undefined> {
    const [profile] = await db
      .select()
      .from(pricingProfiles)
      .where(and(eq(pricingProfiles.companyId, companyId), eq(pricingProfiles.isDefault, true)));
    return profile;
  }

  async createPricingProfile(profileData: InsertPricingProfile): Promise<PricingProfile> {
    const [profile] = await db.insert(pricingProfiles).values(profileData).returning();
    return profile;
  }

  async updatePricingProfile(
    companyId: string,
    id: string,
    data: Partial<InsertPricingProfile>
  ): Promise<PricingProfile | undefined> {
    const [profile] = await db
      .update(pricingProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(pricingProfiles.companyId, companyId), eq(pricingProfiles.id, id)))
      .returning();
    return profile;
  }

  async deletePricingProfile(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(pricingProfiles)
      .where(and(eq(pricingProfiles.companyId, companyId), eq(pricingProfiles.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Pricing Rules
  async getPricingRules(companyId: string, profileId?: string): Promise<PricingRule[]> {
    if (profileId) {
      return db
        .select()
        .from(pricingRules)
        .where(and(eq(pricingRules.companyId, companyId), eq(pricingRules.pricingProfileId, profileId)))
        .orderBy(pricingRules.sortOrder);
    }
    return db
      .select()
      .from(pricingRules)
      .where(eq(pricingRules.companyId, companyId))
      .orderBy(pricingRules.sortOrder);
  }

  async getPricingRule(companyId: string, id: string): Promise<PricingRule | undefined> {
    const [rule] = await db
      .select()
      .from(pricingRules)
      .where(and(eq(pricingRules.companyId, companyId), eq(pricingRules.id, id)));
    return rule;
  }

  async createPricingRule(ruleData: InsertPricingRule): Promise<PricingRule> {
    const [rule] = await db.insert(pricingRules).values(ruleData).returning();
    return rule;
  }

  async updatePricingRule(
    companyId: string,
    id: string,
    data: Partial<InsertPricingRule>
  ): Promise<PricingRule | undefined> {
    const [rule] = await db
      .update(pricingRules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(pricingRules.companyId, companyId), eq(pricingRules.id, id)))
      .returning();
    return rule;
  }

  async deletePricingRule(companyId: string, id: string): Promise<boolean> {
    const result = await db
      .delete(pricingRules)
      .where(and(eq(pricingRules.companyId, companyId), eq(pricingRules.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Helper methods for EstimateEngine
  async getEstimateSnapshotCount(estimateId: string): Promise<number> {
    const snapshots = await db
      .select()
      .from(estimateSnapshots)
      .where(eq(estimateSnapshots.estimateId, estimateId));
    return snapshots.length;
  }

  async getEstimateById(companyId: string, id: string): Promise<Estimate | undefined> {
    const [estimate] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.companyId, companyId), eq(estimates.id, id)));
    return estimate;
  }

  // Estimate Tool Config
  async getEstimateToolConfig(companyId: string): Promise<EstimateToolConfig | undefined> {
    const [config] = await db
      .select()
      .from(estimateToolConfigs)
      .where(eq(estimateToolConfigs.companyId, companyId));
    return config;
  }

  async upsertEstimateToolConfig(config: InsertEstimateToolConfig): Promise<EstimateToolConfig> {
    const [result] = await db
      .insert(estimateToolConfigs)
      .values(config)
      .onConflictDoUpdate({
        target: estimateToolConfigs.companyId,
        set: {
          configData: config.configData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
