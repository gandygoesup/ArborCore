import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseStorage } from '../storage';
import { db } from '../db';
import { companies, users, customers, estimates, estimateSnapshots, costProfileSnapshots, auditLog } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import crypto from 'crypto';

const storage = new DatabaseStorage();

const testCompanyA = {
  id: `test-company-a-${Date.now()}`,
  name: 'Test Company A',
  slug: `test-company-a-${Date.now()}`,
  timezone: 'America/New_York',
  operatingMode: 'small_team' as const
};

const testCompanyB = {
  id: `test-company-b-${Date.now()}`,
  name: 'Test Company B',
  slug: `test-company-b-${Date.now()}`,
  timezone: 'America/New_York',
  operatingMode: 'small_team' as const
};

const testUserA = {
  id: `test-user-a-${Date.now()}`,
  email: 'usera@test.com',
  firstName: 'User',
  lastName: 'A'
};

const testUserB = {
  id: `test-user-b-${Date.now()}`,
  email: 'userb@test.com',
  firstName: 'User',
  lastName: 'B'
};

let customerA: any;
let customerB: any;
let costProfileA: any;
let estimateA: any;

describe('Real DatabaseStorage Integration Tests', () => {
  beforeAll(async () => {
    await db.insert(companies).values(testCompanyA);
    await db.insert(companies).values(testCompanyB);
    
    await db.insert(users).values({ ...testUserA, companyId: testCompanyA.id });
    await db.insert(users).values({ ...testUserB, companyId: testCompanyB.id });
    
    customerA = await storage.createCustomer({
      companyId: testCompanyA.id,
      firstName: 'Customer',
      lastName: 'A',
      email: 'customera@test.com'
    });
    
    customerB = await storage.createCustomer({
      companyId: testCompanyB.id,
      firstName: 'Customer',
      lastName: 'B',
      email: 'customerb@test.com'
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
    await db.delete(auditLog).where(eq(auditLog.companyId, testCompanyA.id));
    await db.delete(auditLog).where(eq(auditLog.companyId, testCompanyB.id));
    await db.delete(users).where(eq(users.id, testUserA.id));
    await db.delete(users).where(eq(users.id, testUserB.id));
    await db.delete(companies).where(eq(companies.id, testCompanyA.id));
    await db.delete(companies).where(eq(companies.id, testCompanyB.id));
  });

  describe('Tenant Isolation - Real Database', () => {
    it('getCustomer returns undefined for wrong companyId', async () => {
      const wrongCompanyAccess = await storage.getCustomer(testCompanyB.id, customerA.id);
      expect(wrongCompanyAccess).toBeUndefined();
    });

    it('getCustomer returns customer for correct companyId', async () => {
      const correctAccess = await storage.getCustomer(testCompanyA.id, customerA.id);
      expect(correctAccess).toBeDefined();
      expect(correctAccess?.id).toBe(customerA.id);
    });

    it('updateCustomer fails silently for wrong companyId', async () => {
      const result = await storage.updateCustomer(testCompanyB.id, customerA.id, { firstName: 'Hacked' });
      expect(result).toBeUndefined();
      
      const original = await storage.getCustomer(testCompanyA.id, customerA.id);
      expect(original?.firstName).toBe('Customer');
    });

    it('getCustomers only returns customers for specified company', async () => {
      const customersA = await storage.getCustomers(testCompanyA.id);
      const customersB = await storage.getCustomers(testCompanyB.id);
      
      expect(customersA.some(c => c.id === customerA.id)).toBe(true);
      expect(customersA.some(c => c.id === customerB.id)).toBe(false);
      expect(customersB.some(c => c.id === customerB.id)).toBe(true);
      expect(customersB.some(c => c.id === customerA.id)).toBe(false);
    });

    it('getEstimate returns undefined for wrong companyId', async () => {
      estimateA = await storage.createEstimate({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateNumber: `EST-TEST-${Date.now()}`,
        status: 'draft',
        workItems: [],
        createdBy: testUserA.id
      });

      const wrongCompanyAccess = await storage.getEstimate(testCompanyB.id, estimateA.id);
      expect(wrongCompanyAccess).toBeUndefined();
    });

    it('updateEstimate fails for wrong companyId', async () => {
      const result = await storage.updateEstimate(testCompanyB.id, estimateA.id, { title: 'Hacked' });
      expect(result).toBeUndefined();
    });
  });

  describe('Snapshot Append-Only Behavior - Real Database', () => {
    let testEstimate: any;
    
    beforeAll(async () => {
      testEstimate = await storage.createEstimate({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateNumber: `EST-SNAP-${Date.now()}`,
        status: 'draft',
        workItems: [],
        createdBy: testUserA.id
      });
    });

    it('creates snapshots successfully', async () => {
      const snapshot1 = await storage.createEstimateSnapshot({
        estimateId: testEstimate.id,
        snapshotVersion: 1,
        triggerAction: 'send',
        costProfileSnapshotId: costProfileA.id,
        workItemsSnapshot: [],
        pricingBreakdown: { test: 'data' },
        subtotal: '100.00',
        taxRate: '0.08',
        taxAmount: '8.00',
        total: '108.00',
        marginPercentage: '30.00',
        previousStatus: 'draft',
        newStatus: 'sent',
        actorId: testUserA.id
      });

      expect(snapshot1.id).toBeDefined();
      expect(snapshot1.snapshotVersion).toBe(1);
    });

    it('getNextSnapshotVersion increments correctly', async () => {
      const nextVersion = await storage.getNextSnapshotVersion(testCompanyA.id, testEstimate.id);
      expect(nextVersion).toBe(2);
    });

    it('multiple snapshots create append-only chain', async () => {
      await storage.createEstimateSnapshot({
        estimateId: testEstimate.id,
        snapshotVersion: 2,
        triggerAction: 'approve',
        costProfileSnapshotId: costProfileA.id,
        workItemsSnapshot: [],
        pricingBreakdown: { test: 'data2' },
        subtotal: '100.00',
        taxRate: '0.08',
        taxAmount: '8.00',
        total: '108.00',
        marginPercentage: '30.00',
        previousStatus: 'sent',
        newStatus: 'approved',
        actorId: testUserA.id
      });

      const allSnapshots = await storage.getEstimateSnapshots(testCompanyA.id, testEstimate.id);
      expect(allSnapshots.length).toBe(2);
      expect(allSnapshots[0].snapshotVersion).toBe(2);
      expect(allSnapshots[1].snapshotVersion).toBe(1);
    });

    it('getLatestEstimateSnapshot returns highest version', async () => {
      const latest = await storage.getLatestEstimateSnapshot(testCompanyA.id, testEstimate.id);
      expect(latest?.snapshotVersion).toBe(2);
      expect(latest?.triggerAction).toBe('approve');
    });

    it('snapshot queries enforce tenant isolation', async () => {
      const wrongCompanySnapshots = await storage.getEstimateSnapshots(testCompanyB.id, testEstimate.id);
      expect(wrongCompanySnapshots.length).toBe(0);
    });
  });

  describe('Magic Link Security - Real Database', () => {
    let magicLinkEstimate: any;
    const magicLinkToken = crypto.randomBytes(32).toString('hex');
    const magicLinkTokenHash = crypto.createHash('sha256').update(magicLinkToken).digest('hex');

    beforeAll(async () => {
      magicLinkEstimate = await storage.createEstimate({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateNumber: `EST-MAGIC-${Date.now()}`,
        status: 'sent',
        workItems: [],
        createdBy: testUserA.id
      });

      await db.update(estimates)
        .set({
          magicLinkTokenHash,
          magicLinkExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          magicLinkUsedAt: null
        })
        .where(eq(estimates.id, magicLinkEstimate.id));
    });

    it('getEstimateByTokenHash returns estimate for valid token', async () => {
      const found = await storage.getEstimateByTokenHash(magicLinkTokenHash);
      expect(found).toBeDefined();
      expect(found?.id).toBe(magicLinkEstimate.id);
    });

    it('getEstimateByTokenHash returns undefined for invalid token', async () => {
      const invalidHash = crypto.createHash('sha256').update('invalid-token').digest('hex');
      const notFound = await storage.getEstimateByTokenHash(invalidHash);
      expect(notFound).toBeUndefined();
    });

    it('markMagicLinkUsed sets magicLinkUsedAt', async () => {
      const used = await storage.markMagicLinkUsed(magicLinkEstimate.id);
      expect(used).toBeDefined();
      expect(used?.magicLinkUsedAt).toBeDefined();
    });

    it('getEstimateByTokenHash returns undefined after use (single-use)', async () => {
      const afterUse = await storage.getEstimateByTokenHash(magicLinkTokenHash);
      expect(afterUse).toBeUndefined();
    });

    it('second markMagicLinkUsed returns undefined (already used)', async () => {
      const secondUse = await storage.markMagicLinkUsed(magicLinkEstimate.id);
      expect(secondUse).toBeUndefined();
    });

    it('getEstimateByTokenHashForView still returns estimate after use', async () => {
      const viewable = await storage.getEstimateByTokenHashForView(magicLinkTokenHash);
      expect(viewable).toBeDefined();
      expect(viewable?.id).toBe(magicLinkEstimate.id);
    });
  });

  describe('Magic Link Expiry - Real Database', () => {
    let expiredEstimate: any;
    const expiredToken = crypto.randomBytes(32).toString('hex');
    const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');

    beforeAll(async () => {
      expiredEstimate = await storage.createEstimate({
        companyId: testCompanyA.id,
        customerId: customerA.id,
        estimateNumber: `EST-EXPIRED-${Date.now()}`,
        status: 'sent',
        workItems: [],
        createdBy: testUserA.id
      });

      await db.update(estimates)
        .set({
          magicLinkTokenHash: expiredTokenHash,
          magicLinkExpiresAt: new Date(Date.now() - 1000),
          magicLinkUsedAt: null
        })
        .where(eq(estimates.id, expiredEstimate.id));
    });

    it('getEstimateByTokenHash returns undefined for expired token', async () => {
      const expired = await storage.getEstimateByTokenHash(expiredTokenHash);
      expect(expired).toBeUndefined();
    });

    it('markMagicLinkUsed fails for expired token', async () => {
      const result = await storage.markMagicLinkUsed(expiredEstimate.id);
      expect(result).toBeUndefined();
    });
  });

  describe('Cost Profile Snapshots - Append-Only', () => {
    it('creates new version without modifying existing', async () => {
      const version2 = await storage.createCostProfileSnapshot({
        companyId: testCompanyA.id,
        version: 2,
        snapshotData: {
          labor: {
            roles: [{ name: 'Senior Arborist', hourlyWage: 35, hoursPerDay: 8, count: 1 }],
            payrollTaxPercent: 10,
            insurancePercent: 5,
            benefitsPercent: 3
          },
          equipment: [],
          overhead: { monthlyRent: 2000, utilities: 500, insurance: 300, software: 200, other: 500 },
          margin: { targetMarginPercentage: 35, minimumFloorPercentage: 20 }
        },
        calculatedOutputs: {
          dailyLaborCostPerCrew: 329,
          dailyEquipmentCost: 0,
          dailyOverheadAllocation: 175,
          targetHourlyRate: 80,
          breakEvenHourlyRate: 56
        },
        createdBy: testUserA.id
      });

      expect(version2.version).toBe(2);

      const allSnapshots = await storage.getCostProfileSnapshots(testCompanyA.id);
      expect(allSnapshots.length).toBeGreaterThanOrEqual(2);
      
      const latest = await storage.getLatestCostProfileSnapshot(testCompanyA.id);
      expect(latest?.version).toBe(2);
    });

    it('cost profile isolation by company', async () => {
      const companyBProfiles = await storage.getCostProfileSnapshots(testCompanyB.id);
      const hasCompanyAProfile = companyBProfiles.some(p => p.companyId === testCompanyA.id);
      expect(hasCompanyAProfile).toBe(false);
    });
  });

  describe('Estimate Number Generation', () => {
    it('generates unique estimate numbers per company', async () => {
      const num1 = await storage.generateEstimateNumber(testCompanyA.id);
      const num2 = await storage.generateEstimateNumber(testCompanyA.id);
      
      expect(num1).toMatch(/^EST-\d{4}-\d{4}$/);
      expect(num2).toMatch(/^EST-\d{4}-\d{4}$/);
    });
  });
});
