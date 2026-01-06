import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { storage, DatabaseStorage } from '../storage';
import { db } from '../db';
import { companies, users, customers, estimates, estimateSnapshots, costProfileSnapshots, auditLogs, contracts, contractTemplates, signedContractSnapshots, roles, userRoles } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

vi.mock('../replitAuth', () => ({
  setupAuth: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    next();
  }
}));

import { registerRoutes } from '../routes';

const testCompanyA = {
  id: `route-test-company-a-${Date.now()}`,
  name: 'Route Test Company A',
  slug: `route-test-company-a-${Date.now()}`,
  timezone: 'America/New_York',
  operatingMode: 'small_team' as const
};

const testCompanyB = {
  id: `route-test-company-b-${Date.now()}`,
  name: 'Route Test Company B',
  slug: `route-test-company-b-${Date.now()}`,
  timezone: 'America/New_York',
  operatingMode: 'small_team' as const
};

const testUserA = {
  id: `route-test-user-a-${Date.now()}`,
  email: 'routeusera@test.com',
  firstName: 'RouteUser',
  lastName: 'A'
};

const testUserB = {
  id: `route-test-user-b-${Date.now()}`,
  email: 'routeuserb@test.com',
  firstName: 'RouteUser',
  lastName: 'B'
};

let app: express.Express;
let customerA: any;
let costProfileA: any;

const mockAuthMiddleware = (userId: string, companyId: string) => {
  return (req: any, res: any, next: any) => {
    req.user = { claims: { sub: userId } };
    next();
  };
};

describe('Real Routes Integration Tests', () => {
  beforeAll(async () => {
    await db.insert(companies).values(testCompanyA);
    await db.insert(companies).values(testCompanyB);
    
    await db.insert(users).values({ ...testUserA, companyId: testCompanyA.id, role: 'Admin' });
    await db.insert(users).values({ ...testUserB, companyId: testCompanyB.id, role: 'Admin' });
    
    const [adminRoleA] = await db.insert(roles).values({
      companyId: testCompanyA.id,
      name: 'Admin',
      isSystemRole: true,
      isDefault: false
    }).returning();
    const [adminRoleB] = await db.insert(roles).values({
      companyId: testCompanyB.id,
      name: 'Admin',
      isSystemRole: true,
      isDefault: false
    }).returning();
    
    await db.insert(userRoles).values({ userId: testUserA.id, roleId: adminRoleA.id });
    await db.insert(userRoles).values({ userId: testUserB.id, roleId: adminRoleB.id });
    
    customerA = await storage.createCustomer({
      companyId: testCompanyA.id,
      firstName: 'RouteCustomer',
      lastName: 'A',
      email: 'routecustomera@test.com'
    });
    
    costProfileA = await storage.createCostProfileSnapshot({
      companyId: testCompanyA.id,
      version: 1,
      snapshotData: {
        labor: {
          roles: [{ name: 'Arborist', hourlyWage: 25, hoursPerDay: 8, count: 2 }],
          payrollTaxPercent: 10,
          insurancePercent: 5,
          benefitsPercent: 3
        },
        equipment: [{ name: 'Chainsaw', monthlyCost: 500, usableWorkdaysPerMonth: 20 }],
        overhead: { monthlyRent: 2000, utilities: 500, insurance: 300, software: 200, other: 500 },
        margin: { targetMarginPercentage: 30, minimumFloorPercentage: 15 }
      },
      calculatedOutputs: {
        dailyLaborCostPerCrew: 472,
        dailyEquipmentCost: 75,
        dailyOverheadAllocation: 175,
        targetHourlyRate: 75,
        breakEvenHourlyRate: 52.5
      },
      createdBy: testUserA.id
    });

    app = express();
    app.use(express.json());
    
    app.use(async (req: any, res, next) => {
      const authHeader = req.headers['x-test-user-id'];
      if (authHeader) {
        req.user = { claims: { sub: authHeader } };
        const user = await storage.getUser(authHeader as string);
        if (user) {
          const userRolesList = await storage.getUserRoles(user.id);
          req.authedUser = {
            id: user.id,
            companyId: user.companyId,
            roles: userRolesList.map((r: any) => r.name),
          };
        }
      }
      next();
    });
    
    await registerRoutes(app);
  });

  afterAll(async () => {
    await db.delete(estimateSnapshots).where(
      sql`estimate_id IN (SELECT id FROM estimates WHERE company_id IN (${testCompanyA.id}, ${testCompanyB.id}))`
    );
    await db.delete(estimates).where(eq(estimates.companyId, testCompanyA.id));
    await db.delete(estimates).where(eq(estimates.companyId, testCompanyB.id));
    await db.delete(costProfileSnapshots).where(eq(costProfileSnapshots.companyId, testCompanyA.id));
    await db.delete(costProfileSnapshots).where(eq(costProfileSnapshots.companyId, testCompanyB.id));
    await db.delete(customers).where(eq(customers.companyId, testCompanyA.id));
    await db.delete(customers).where(eq(customers.companyId, testCompanyB.id));
    await db.delete(auditLogs).where(eq(auditLogs.companyId, testCompanyA.id));
    await db.delete(auditLogs).where(eq(auditLogs.companyId, testCompanyB.id));
    await db.delete(userRoles).where(eq(userRoles.userId, testUserA.id));
    await db.delete(userRoles).where(eq(userRoles.userId, testUserB.id));
    await db.delete(roles).where(eq(roles.companyId, testCompanyA.id));
    await db.delete(roles).where(eq(roles.companyId, testCompanyB.id));
    await db.delete(users).where(eq(users.id, testUserA.id));
    await db.delete(users).where(eq(users.id, testUserB.id));
    await db.delete(companies).where(eq(companies.id, testCompanyA.id));
    await db.delete(companies).where(eq(companies.id, testCompanyB.id));
  });

  describe('Authenticated Estimate Routes', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app)
        .get('/api/estimates')
        .expect(401);
      
      expect(res.body.message).toBe('Unauthorized');
    });

    it('creates estimate through actual route', async () => {
      const res = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'Route Test Estimate',
          workItems: [
            {
              id: 'item-1',
              description: 'Tree removal',
              quantity: 1,
              unit: 'job',
              unitPrice: 500,
              laborHours: 8
            }
          ]
        })
        .expect(200);
      
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('draft');
      expect(res.body.companyId).toBe(testCompanyA.id);
    });

    it('GET /api/estimates returns only user company estimates', async () => {
      const resA = await request(app)
        .get('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .expect(200);
      
      expect(resA.body.every((e: any) => e.companyId === testCompanyA.id)).toBe(true);
      
      const resB = await request(app)
        .get('/api/estimates')
        .set('x-test-user-id', testUserB.id)
        .expect(200);
      
      expect(resB.body.every((e: any) => e.companyId === testCompanyB.id)).toBe(true);
    });
  });

  describe('Estimate State Machine via Routes', () => {
    let draftEstimate: any;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'State Machine Test',
          workItems: [
            {
              id: 'item-1',
              description: 'Pruning',
              quantity: 2,
              unit: 'trees',
              unitPrice: 150,
              laborHours: 4
            }
          ]
        });
      draftEstimate = res.body;
    });

    it('PATCH succeeds on draft estimate', async () => {
      const res = await request(app)
        .patch(`/api/estimates/${draftEstimate.id}`)
        .set('x-test-user-id', testUserA.id)
        .send({ title: 'Updated Title' })
        .expect(200);
      
      expect(res.body.title).toBe('Updated Title');
    });

    it('POST /send transitions to sent and creates snapshot', async () => {
      const res = await request(app)
        .post(`/api/estimates/${draftEstimate.id}/send`)
        .set('x-test-user-id', testUserA.id)
        .expect(200);
      
      expect(res.body.estimate.status).toBe('sent');
      expect(res.body.magicLinkToken).toBeDefined();
      expect(res.body.magicLinkToken.length).toBe(64);
      
      const snapshots = await storage.getEstimateSnapshots(testCompanyA.id, draftEstimate.id);
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].triggerAction).toBe('send');
    });

    it('PATCH returns 409 on sent estimate', async () => {
      const res = await request(app)
        .patch(`/api/estimates/${draftEstimate.id}`)
        .set('x-test-user-id', testUserA.id)
        .send({ title: 'Try to update' })
        .expect(409);
      
      expect(res.body.message).toContain('draft');
    });

    it('POST /send returns 409 on already-sent estimate', async () => {
      const res = await request(app)
        .post(`/api/estimates/${draftEstimate.id}/send`)
        .set('x-test-user-id', testUserA.id)
        .expect(409);
      
      expect(res.body.message).toContain('draft');
    });
  });

  describe('Tenant Isolation via Routes', () => {
    let companyAEstimate: any;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'Company A Estimate',
          workItems: []
        });
      companyAEstimate = res.body;
    });

    it('user B cannot access user A estimate', async () => {
      const res = await request(app)
        .get(`/api/estimates/${companyAEstimate.id}`)
        .set('x-test-user-id', testUserB.id)
        .expect(404);
      
      expect(res.body.message).toBe('Estimate not found');
    });

    it('user A can access own estimate', async () => {
      const res = await request(app)
        .get(`/api/estimates/${companyAEstimate.id}`)
        .set('x-test-user-id', testUserA.id)
        .expect(200);
      
      expect(res.body.estimate.id).toBe(companyAEstimate.id);
    });

    it('user B cannot update user A estimate', async () => {
      const res = await request(app)
        .patch(`/api/estimates/${companyAEstimate.id}`)
        .set('x-test-user-id', testUserB.id)
        .send({ title: 'Hacked' })
        .expect(404);
    });
  });

  describe('Magic Link Portal Routes', () => {
    let sentEstimate: any;
    let magicLinkToken: string;

    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'Portal Test Estimate',
          workItems: [
            {
              id: 'item-1',
              description: 'Stump removal',
              quantity: 1,
              unit: 'job',
              unitPrice: 300,
              laborHours: 3
            }
          ]
        });
      
      const sendRes = await request(app)
        .post(`/api/estimates/${createRes.body.id}/send`)
        .set('x-test-user-id', testUserA.id);
      
      sentEstimate = sendRes.body.estimate;
      magicLinkToken = sendRes.body.magicLinkToken;
    });

    it('GET /portal/estimates/:token returns estimate for valid token', async () => {
      const res = await request(app)
        .get(`/api/portal/estimates/${magicLinkToken}`)
        .expect(200);
      
      expect(res.body.estimate.id).toBe(sentEstimate.id);
    });

    it('GET /portal/estimates/:token returns 410 for invalid token (normalized)', async () => {
      const res = await request(app)
        .get('/api/portal/estimates/invalid-token-12345')
        .expect(410);
      
      expect(res.body.message).toBe('This link is no longer valid');
    });

    it('POST /portal/estimates/:token/approve transitions to approved', async () => {
      const res = await request(app)
        .post(`/api/portal/estimates/${magicLinkToken}/approve`)
        .expect(200);
      
      expect(res.body.estimate.status).toBe('approved');
    });

    it('magic link is single-use - second approve returns 410 with normalized message', async () => {
      const res = await request(app)
        .post(`/api/portal/estimates/${magicLinkToken}/approve`)
        .expect(410);
      
      expect(res.body.message).toBe('This link is no longer valid');
    });

    it('approve creates snapshot with correct trigger action', async () => {
      const snapshots = await storage.getEstimateSnapshots(testCompanyA.id, sentEstimate.id);
      const approveSnapshot = snapshots.find(s => s.triggerAction === 'approve');
      
      expect(approveSnapshot).toBeDefined();
      expect(approveSnapshot?.newStatus).toBe('approved');
    });
  });

  describe('Pricing Calculation Routes', () => {
    let draftEstimate: any;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'Pricing Test',
          workItems: [
            {
              id: 'item-1',
              description: 'Large tree removal',
              quantity: 1,
              unit: 'job',
              unitPrice: 1000,
              laborHours: 16,
              equipmentIds: ['0']
            }
          ]
        });
      draftEstimate = res.body;
    });

    it('POST /calculate returns pricing breakdown', async () => {
      const res = await request(app)
        .post(`/api/estimates/${draftEstimate.id}/calculate`)
        .set('x-test-user-id', testUserA.id)
        .expect(200);
      
      expect(res.body.breakdown).toBeDefined();
      expect(res.body.subtotal).toBeDefined();
      expect(res.body.total).toBeDefined();
    });

    it('override requires reason', async () => {
      const res = await request(app)
        .post(`/api/estimates/${draftEstimate.id}/calculate`)
        .set('x-test-user-id', testUserA.id)
        .send({ overrideMultiplier: 0.9 })
        .expect(400);
      
      expect(res.body.message).toContain('reason');
    });

    it('override with reason succeeds', async () => {
      const res = await request(app)
        .post(`/api/estimates/${draftEstimate.id}/calculate`)
        .set('x-test-user-id', testUserA.id)
        .send({ 
          overrideMultiplier: 0.9,
          overrideReason: 'Returning customer discount'
        })
        .expect(200);
      
      expect(res.body.isOverride).toBe(true);
    });
  });

  describe('Audit Trail via Routes', () => {
    it('estimate creation is logged', async () => {
      const createRes = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'Audit Test',
          workItems: []
        });
      
      const auditEntries = await storage.getAuditLog(testCompanyA.id, 10);
      const createEntry = auditEntries.find(
        e => e.action === 'estimate.created' && e.entityId === createRes.body.id
      );
      
      expect(createEntry).toBeDefined();
      expect(createEntry?.userId).toBe(testUserA.id);
    });

    it('estimate send is logged', async () => {
      const createRes = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', testUserA.id)
        .send({
          customerId: customerA.id,
          title: 'Audit Send Test',
          workItems: [{ id: '1', description: 'Test', quantity: 1, unit: 'job', unitPrice: 100, laborHours: 1 }]
        });
      
      await request(app)
        .post(`/api/estimates/${createRes.body.id}/send`)
        .set('x-test-user-id', testUserA.id);
      
      const auditEntries = await storage.getAuditLog(testCompanyA.id, 10);
      const sendEntry = auditEntries.find(
        e => e.action === 'estimate.sent' && e.entityId === createRes.body.id
      );
      
      expect(sendEntry).toBeDefined();
    });
  });

  describe('Contract Immutability (Legal Truth Layer)', () => {
    let testContract: any;
    let testTemplate: any;
    let testEstimate: any;

    beforeAll(async () => {
      const estimateNumber = await storage.generateEstimateNumber(testCompanyA.id);
      testEstimate = await storage.createEstimate({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateNumber,
        title: 'Contract Test Estimate',
        status: 'approved',
        workItems: [{ id: '1', description: 'Test work', quantity: 1, unit: 'job', unitPrice: 1000, laborHours: 8 }],
      });

      testTemplate = await storage.createContractTemplate({
        companyId: testCompanyA.id,
        name: 'Test Template',
        headerContent: '# Contract Agreement',
        termsContent: '## Terms and Conditions',
        footerContent: '## Signatures',
        isDefault: true,
      });

      testContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0001',
        templateId: testTemplate.id,
        headerContent: '# Contract Agreement',
        workItemsContent: '## Work Items\n- Tree removal',
        termsContent: '## Terms and Conditions\nPayment due in 30 days.',
        footerContent: '## Signatures',
        status: 'sent',
      });
    });

    afterAll(async () => {
      if (testContract) {
        await db.delete(contracts).where(eq(contracts.id, testContract.id));
      }
      if (testTemplate) {
        await db.delete(contractTemplates).where(eq(contractTemplates.id, testTemplate.id));
      }
      if (testEstimate) {
        await db.delete(estimates).where(eq(estimates.id, testEstimate.id));
      }
    });

    it('POST /send returns 409 for signed contracts', async () => {
      const signedContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0002',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'signed',
        signedAt: new Date(),
        signerName: 'John Doe',
        lockedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/contracts/${signedContract.id}/send`)
        .set('x-test-user-id', testUserA.id)
        .expect(409);

      expect(res.body.message).toContain('signed');

      await db.delete(contracts).where(eq(contracts.id, signedContract.id));
    });

    it('POST /send returns 409 for voided contracts', async () => {
      const voidedContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0003',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'voided',
        voidedAt: new Date(),
        voidedReason: 'Test void',
      });

      const res = await request(app)
        .post(`/api/contracts/${voidedContract.id}/send`)
        .set('x-test-user-id', testUserA.id)
        .expect(409);

      expect(res.body.message).toContain('voided');

      await db.delete(contracts).where(eq(contracts.id, voidedContract.id));
    });

    it('POST /void returns 400 without reason', async () => {
      const draftContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0004',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'draft',
      });

      const res = await request(app)
        .post(`/api/contracts/${draftContract.id}/void`)
        .set('x-test-user-id', testUserA.id)
        .send({})
        .expect(400);

      expect(res.body.message).toContain('reason');

      await db.delete(contracts).where(eq(contracts.id, draftContract.id));
    });

    it('POST /void with reason succeeds', async () => {
      const draftContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0005',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'draft',
      });

      const res = await request(app)
        .post(`/api/contracts/${draftContract.id}/void`)
        .set('x-test-user-id', testUserA.id)
        .send({ reason: 'Customer requested cancellation' })
        .expect(200);

      expect(res.body.status).toBe('voided');
      expect(res.body.voidedReason).toBe('Customer requested cancellation');

      await db.delete(contracts).where(eq(contracts.id, draftContract.id));
    });

    it('GET /signed-snapshot returns 400 for unsigned contracts', async () => {
      const res = await request(app)
        .get(`/api/contracts/${testContract.id}/signed-snapshot`)
        .set('x-test-user-id', testUserA.id)
        .expect(400);

      expect(res.body.message).toContain('not been signed');
    });

    it('GET /signed-snapshot returns snapshot for signed contracts', async () => {
      const signedContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0006',
        templateId: testTemplate.id,
        headerContent: '# Signed Contract Header',
        workItemsContent: '## Signed Work Items',
        termsContent: '## Signed Terms',
        footerContent: '## Signed Footer',
        status: 'signed',
        signedAt: new Date(),
        signerName: 'Jane Doe',
        lockedAt: new Date(),
      });

      await storage.createSignedContractSnapshot({
        contractId: signedContract.id,
        companyId: testCompanyA.id,
        headerContent: '# Signed Contract Header',
        workItemsContent: '## Signed Work Items',
        termsContent: '## Signed Terms',
        footerContent: '## Signed Footer',
        signedAt: new Date(),
        signerName: 'Jane Doe',
        signerIpAddress: '127.0.0.1',
        signerUserAgent: 'Test Agent',
      });

      const res = await request(app)
        .get(`/api/contracts/${signedContract.id}/signed-snapshot`)
        .set('x-test-user-id', testUserA.id)
        .expect(200);

      expect(res.body.headerContent).toBe('# Signed Contract Header');
      expect(res.body.workItemsContent).toBe('## Signed Work Items');
      expect(res.body.termsContent).toBe('## Signed Terms');
      expect(res.body.signerName).toBe('Jane Doe');

      await db.delete(signedContractSnapshots).where(eq(signedContractSnapshots.contractId, signedContract.id));
      await db.delete(contracts).where(eq(contracts.id, signedContract.id));
    });

    it('GET contract detail includes signedSnapshot for signed contracts', async () => {
      const signedContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0007',
        templateId: testTemplate.id,
        headerContent: '# Original Header (mutable)',
        workItemsContent: '## Original Work',
        termsContent: '## Original Terms',
        footerContent: '## Original Footer',
        status: 'signed',
        signedAt: new Date(),
        signerName: 'Signed User',
        lockedAt: new Date(),
      });

      await storage.createSignedContractSnapshot({
        contractId: signedContract.id,
        companyId: testCompanyA.id,
        headerContent: '# Immutable Snapshot Header',
        workItemsContent: '## Immutable Work Items',
        termsContent: '## Immutable Terms',
        footerContent: '## Immutable Footer',
        signedAt: new Date(),
        signerName: 'Signed User',
        signerIpAddress: '127.0.0.1',
        signerUserAgent: 'Test Agent',
      });

      const res = await request(app)
        .get(`/api/contracts/${signedContract.id}`)
        .set('x-test-user-id', testUserA.id)
        .expect(200);

      expect(res.body.signedSnapshot).toBeDefined();
      expect(res.body.signedSnapshot.headerContent).toBe('# Immutable Snapshot Header');
      expect(res.body.signedSnapshot.workItemsContent).toBe('## Immutable Work Items');

      await db.delete(signedContractSnapshots).where(eq(signedContractSnapshots.contractId, signedContract.id));
      await db.delete(contracts).where(eq(contracts.id, signedContract.id));
    });

    it('storage.updateContract rejects modifications to signed contracts', async () => {
      const signedContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0008',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'signed',
        signedAt: new Date(),
        signerName: 'Test',
        lockedAt: new Date(),
      });

      await expect(
        storage.updateContract(testCompanyA.id, signedContract.id, { headerContent: '# Modified' })
      ).rejects.toThrow('Cannot modify a signed contract');

      await db.delete(contracts).where(eq(contracts.id, signedContract.id));
    });

    it('storage.signContract only works from sent status', async () => {
      const draftContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0009',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'draft',
      });

      await expect(
        storage.signContract(testCompanyA.id, draftContract.id, {
          signedAt: new Date(),
          signerName: 'Test User',
        })
      ).rejects.toThrow('Cannot sign contract');

      await db.delete(contracts).where(eq(contracts.id, draftContract.id));
    });

    it('storage.voidContract rejects already voided contracts', async () => {
      const voidedContract = await storage.createContract({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateId: testEstimate.id,
        contractNumber: 'C-2026-0010',
        templateId: testTemplate.id,
        headerContent: '# Contract',
        workItemsContent: '## Work',
        termsContent: '## Terms',
        footerContent: '## Footer',
        status: 'voided',
        voidedAt: new Date(),
        voidedReason: 'Initial void',
      });

      await expect(
        storage.voidContract(testCompanyA.id, voidedContract.id, 'Second void attempt')
      ).rejects.toThrow('already voided');

      await db.delete(contracts).where(eq(contracts.id, voidedContract.id));
    });
  });
});
