import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { storage } from '../storage';
import { db } from '../db';
import { companies, users, customers, estimates, estimateSnapshots, costProfileSnapshots, invoices, roles, userRoles, auditLog } from '@shared/schema';
import { eq, sql, and, inArray } from 'drizzle-orm';

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

const timestamp = Date.now();

const testCompanyA = {
  id: `auth-test-company-a-${timestamp}`,
  name: 'Auth Test Company A',
  slug: `auth-test-company-a-${timestamp}`,
  timezone: 'America/New_York',
  operatingMode: 'small_team' as const
};

const testCompanyB = {
  id: `auth-test-company-b-${timestamp}`,
  name: 'Auth Test Company B',
  slug: `auth-test-company-b-${timestamp}`,
  timezone: 'America/New_York',
  operatingMode: 'small_team' as const
};

const adminUser = {
  id: `auth-admin-${timestamp}`,
  email: `authadmin-${timestamp}@test.com`,
  firstName: 'Auth',
  lastName: 'Admin'
};

const estimatorUser = {
  id: `auth-estimator-${timestamp}`,
  email: `authestimator-${timestamp}@test.com`,
  firstName: 'Auth',
  lastName: 'Estimator'
};

const accountantUser = {
  id: `auth-accountant-${timestamp}`,
  email: `authaccountant-${timestamp}@test.com`,
  firstName: 'Auth',
  lastName: 'Accountant'
};

const noRoleUser = {
  id: `auth-norole-${timestamp}`,
  email: `authnorole-${timestamp}@test.com`,
  firstName: 'Auth',
  lastName: 'NoRole'
};

const companyBUser = {
  id: `auth-companyb-${timestamp}`,
  email: `authcompanyb-${timestamp}@test.com`,
  firstName: 'Auth',
  lastName: 'CompanyB'
};

let app: express.Express;
let customerA: any;
let costProfileA: any;
let adminRoleId: string;
let estimatorRoleId: string;
let accountantRoleId: string;

describe('Authorization Tests', () => {
  beforeAll(async () => {
    await db.insert(companies).values(testCompanyA);
    await db.insert(companies).values(testCompanyB);
    
    await db.insert(users).values({ ...adminUser, companyId: testCompanyA.id });
    await db.insert(users).values({ ...estimatorUser, companyId: testCompanyA.id });
    await db.insert(users).values({ ...accountantUser, companyId: testCompanyA.id });
    await db.insert(users).values({ ...noRoleUser, companyId: testCompanyA.id });
    await db.insert(users).values({ ...companyBUser, companyId: testCompanyB.id });
    
    const createdRoles = await storage.createDefaultRoles(testCompanyA.id);
    adminRoleId = createdRoles.find(r => r.name === 'Admin')!.id;
    estimatorRoleId = createdRoles.find(r => r.name === 'Estimator')!.id;
    accountantRoleId = createdRoles.find(r => r.name === 'Accountant')!.id;
    
    await storage.assignUserRole(adminUser.id, adminRoleId, adminUser.id);
    await storage.assignUserRole(estimatorUser.id, estimatorRoleId, adminUser.id);
    await storage.assignUserRole(accountantUser.id, accountantRoleId, adminUser.id);
    
    const companyBRoles = await storage.createDefaultRoles(testCompanyB.id);
    const companyBAdminRoleId = companyBRoles.find(r => r.name === 'Admin')!.id;
    await storage.assignUserRole(companyBUser.id, companyBAdminRoleId, companyBUser.id);
    
    customerA = await storage.createCustomer({
      companyId: testCompanyA.id,
      firstName: 'AuthCustomer',
      lastName: 'A',
      email: 'authcustomera@test.com'
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
      createdBy: adminUser.id
    });

    app = express();
    app.use(express.json());
    
    app.use((req: any, res, next) => {
      const authHeader = req.headers['x-test-user-id'];
      if (authHeader) {
        req.user = { claims: { sub: authHeader } };
      }
      next();
    });
    
    await registerRoutes(app);
  });

  afterAll(async () => {
    const testUserIds = [adminUser.id, estimatorUser.id, accountantUser.id, noRoleUser.id, companyBUser.id];
    const testCompanyIds = [testCompanyA.id, testCompanyB.id];
    
    await db.delete(auditLog).where(inArray(auditLog.userId, testUserIds));
    await db.delete(auditLog).where(inArray(auditLog.companyId, testCompanyIds));
    await db.delete(estimateSnapshots).where(
      sql`estimate_id IN (SELECT id FROM estimates WHERE company_id IN (${testCompanyA.id}, ${testCompanyB.id}))`
    );
    await db.delete(estimates).where(eq(estimates.companyId, testCompanyA.id));
    await db.delete(estimates).where(eq(estimates.companyId, testCompanyB.id));
    await db.delete(invoices).where(eq(invoices.companyId, testCompanyA.id));
    await db.delete(invoices).where(eq(invoices.companyId, testCompanyB.id));
    await db.delete(costProfileSnapshots).where(eq(costProfileSnapshots.companyId, testCompanyA.id));
    await db.delete(costProfileSnapshots).where(eq(costProfileSnapshots.companyId, testCompanyB.id));
    await db.delete(customers).where(eq(customers.companyId, testCompanyA.id));
    await db.delete(customers).where(eq(customers.companyId, testCompanyB.id));
    await db.delete(userRoles).where(inArray(userRoles.userId, testUserIds));
    await db.delete(roles).where(eq(roles.companyId, testCompanyA.id));
    await db.delete(roles).where(eq(roles.companyId, testCompanyB.id));
    await db.delete(users).where(inArray(users.id, testUserIds));
    await db.delete(companies).where(eq(companies.id, testCompanyA.id));
    await db.delete(companies).where(eq(companies.id, testCompanyB.id));
  });

  describe('Role-Based Access Control - 403 Forbidden', () => {
    describe('Estimate Routes', () => {
      it('returns 403 when user without role tries to create estimate', async () => {
        const res = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', noRoleUser.id)
          .send({
            customerId: customerA.id,
            title: 'Test Estimate',
            workItems: []
          })
          .expect(403);
        
        expect(res.body.message).toBe('Forbidden');
      });

      it('returns 403 when Accountant tries to create estimate', async () => {
        const res = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', accountantUser.id)
          .send({
            customerId: customerA.id,
            title: 'Test Estimate',
            workItems: []
          })
          .expect(403);
        
        expect(res.body.message).toBe('Forbidden');
      });

      it('allows Estimator to create estimate', async () => {
        const res = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', estimatorUser.id)
          .send({
            customerId: customerA.id,
            title: 'Estimator Test',
            workItems: []
          })
          .expect(200);
        
        expect(res.body.id).toBeDefined();
      });

      it('allows Admin to create estimate', async () => {
        const res = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', adminUser.id)
          .send({
            customerId: customerA.id,
            title: 'Admin Test',
            workItems: []
          })
          .expect(200);
        
        expect(res.body.id).toBeDefined();
      });
    });

    describe('Cost Profile Routes', () => {
      it('returns 403 when Estimator tries to create cost profile', async () => {
        const res = await request(app)
          .post('/api/cost-profiles')
          .set('x-test-user-id', estimatorUser.id)
          .send({
            snapshotData: costProfileA.snapshotData
          })
          .expect(403);
        
        expect(res.body.message).toBe('Forbidden');
      });

      it('returns 403 when Accountant tries to create cost profile', async () => {
        const res = await request(app)
          .post('/api/cost-profiles')
          .set('x-test-user-id', accountantUser.id)
          .send({})
          .expect(403);
        
        expect(res.body.message).toBe('Forbidden');
      });
    });
  });

  describe('Cross-Company Access - 404 Not Found', () => {
    let companyAEstimate: any;
    let companyACustomerId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', adminUser.id)
        .send({
          customerId: customerA.id,
          title: 'Company A Cross-tenant Test',
          workItems: []
        });
      companyAEstimate = res.body;
      companyACustomerId = customerA.id;
    });

    it('returns 404 when user from Company B tries to GET Company A estimate', async () => {
      const res = await request(app)
        .get(`/api/estimates/${companyAEstimate.id}`)
        .set('x-test-user-id', companyBUser.id)
        .expect(404);
      
      expect(res.body.message).toBe('Estimate not found');
    });

    it('returns 404 when user from Company B tries to PATCH Company A estimate', async () => {
      const res = await request(app)
        .patch(`/api/estimates/${companyAEstimate.id}`)
        .set('x-test-user-id', companyBUser.id)
        .send({ title: 'Hacked Title' })
        .expect(404);
    });

    it('returns 404 when user from Company B tries to DELETE Company A estimate', async () => {
      const res = await request(app)
        .delete(`/api/estimates/${companyAEstimate.id}`)
        .set('x-test-user-id', companyBUser.id)
        .expect(404);
    });

    it('returns 404 when user from Company B tries to send Company A estimate', async () => {
      const res = await request(app)
        .post(`/api/estimates/${companyAEstimate.id}/send`)
        .set('x-test-user-id', companyBUser.id)
        .expect(404);
    });

    it('GET /api/customers only returns own company customers', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('x-test-user-id', companyBUser.id)
        .expect(200);
      
      expect(res.body.every((c: any) => c.companyId === testCompanyB.id || c.companyId === undefined)).toBe(true);
      expect(res.body.find((c: any) => c.id === companyACustomerId)).toBeUndefined();
    });

    it('GET /api/estimates only returns own company estimates', async () => {
      const res = await request(app)
        .get('/api/estimates')
        .set('x-test-user-id', companyBUser.id)
        .expect(200);
      
      expect(res.body.every((e: any) => e.companyId === testCompanyB.id)).toBe(true);
      expect(res.body.find((e: any) => e.id === companyAEstimate.id)).toBeUndefined();
    });
  });

  describe('State Machine Enforcement - 400 Bad Request', () => {
    describe('Estimate Transitions', () => {
      let draftEstimate: any;
      let sentEstimate: any;

      beforeAll(async () => {
        const draftRes = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', adminUser.id)
          .send({
            customerId: customerA.id,
            title: 'Draft State Test',
            workItems: [{ id: 'i1', description: 'Tree work', quantity: 1, unit: 'job', unitPrice: 100, laborHours: 1 }]
          });
        draftEstimate = draftRes.body;

        const sentDraftRes = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', adminUser.id)
          .send({
            customerId: customerA.id,
            title: 'Sent State Test',
            workItems: [{ id: 'i2', description: 'Tree work', quantity: 1, unit: 'job', unitPrice: 100, laborHours: 1 }]
          });
        
        const sendRes = await request(app)
          .post(`/api/estimates/${sentDraftRes.body.id}/send`)
          .set('x-test-user-id', adminUser.id);
        sentEstimate = sendRes.body.estimate;
      });

      it('draft estimate can be sent (valid transition)', async () => {
        const newDraft = await request(app)
          .post('/api/estimates')
          .set('x-test-user-id', adminUser.id)
          .send({
            customerId: customerA.id,
            title: 'Valid Transition Test',
            workItems: [{ id: 'i3', description: 'Work', quantity: 1, unit: 'job', unitPrice: 100, laborHours: 1 }]
          });

        const res = await request(app)
          .post(`/api/estimates/${newDraft.body.id}/send`)
          .set('x-test-user-id', adminUser.id)
          .expect(200);
        
        expect(res.body.estimate.status).toBe('sent');
      });

      it('returns 400 when trying to send already-sent estimate (invalid transition)', async () => {
        const res = await request(app)
          .post(`/api/estimates/${sentEstimate.id}/send`)
          .set('x-test-user-id', adminUser.id)
          .expect(400);
        
        expect(res.body.message).toContain('Invalid');
      });

      it('returns 400 when non-admin tries to edit sent estimate (state locked)', async () => {
        const res = await request(app)
          .patch(`/api/estimates/${sentEstimate.id}`)
          .set('x-test-user-id', estimatorUser.id)
          .send({ title: 'Try to edit sent' })
          .expect(400);
        
        expect(res.body.message).toContain('locked');
      });

      it('draft estimate can be edited by Estimator', async () => {
        const res = await request(app)
          .patch(`/api/estimates/${draftEstimate.id}`)
          .set('x-test-user-id', estimatorUser.id)
          .send({ title: 'Updated by Estimator' })
          .expect(200);
        
        expect(res.body.title).toBe('Updated by Estimator');
      });
    });
  });

  describe('Combined Authorization Scenarios', () => {
    it('wrong company + wrong role returns 404 (company check first)', async () => {
      const companyAEst = await request(app)
        .post('/api/estimates')
        .set('x-test-user-id', adminUser.id)
        .send({
          customerId: customerA.id,
          title: 'Combined Test',
          workItems: []
        });

      const res = await request(app)
        .delete(`/api/estimates/${companyAEst.body.id}`)
        .set('x-test-user-id', companyBUser.id)
        .expect(404);
    });

    it('correct company but wrong role returns 403', async () => {
      const res = await request(app)
        .post('/api/cost-profiles')
        .set('x-test-user-id', accountantUser.id)
        .send({
          snapshotData: costProfileA.snapshotData
        })
        .expect(403);
      
      expect(res.body.message).toBe('Forbidden');
    });
  });
});
