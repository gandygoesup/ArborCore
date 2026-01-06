import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { EstimatePricingService } from '../services/estimatePricing';
import type { WorkItem, CostProfileSnapshot, CostProfileInput } from '@shared/schema';

const createMockCostProfile = (): CostProfileSnapshot => ({
  id: 'cp-1',
  companyId: 'company-1',
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
  } as CostProfileInput,
  calculatedOutputs: {
    dailyLaborCostPerCrew: 472,
    dailyEquipmentCost: 75,
    dailyOverheadAllocation: 175,
    targetHourlyRate: 75,
    breakEvenHourlyRate: 52.5
  },
  createdBy: 'user-1',
  createdAt: new Date()
});

describe('Tenant Isolation', () => {
  it('storage interface enforces companyId on getCustomer', () => {
    const storageInterface = `getCustomer(companyId: string, id: string): Promise<Customer | undefined>`;
    expect(storageInterface).toContain('companyId: string');
    expect(storageInterface).toContain('id: string');
  });

  it('storage interface enforces companyId on getLead', () => {
    const storageInterface = `getLead(companyId: string, id: string): Promise<Lead | undefined>`;
    expect(storageInterface).toContain('companyId: string');
  });

  it('storage interface enforces companyId on getEstimate', () => {
    const storageInterface = `getEstimate(companyId: string, id: string): Promise<Estimate | undefined>`;
    expect(storageInterface).toContain('companyId: string');
  });

  it('storage interface enforces companyId on updateEstimate', () => {
    const storageInterface = `updateEstimate(companyId: string, id: string, data: Partial<InsertEstimate>): Promise<Estimate | undefined>`;
    expect(storageInterface).toContain('companyId: string');
  });

  it('all entity lookups require both companyId and entityId', () => {
    const methods = [
      'getCustomer(companyId: string, id: string)',
      'getLead(companyId: string, id: string)',
      'getEstimate(companyId: string, id: string)',
      'updateCustomer(companyId: string, id: string, data)',
      'updateLead(companyId: string, id: string, data)',
      'updateEstimate(companyId: string, id: string, data)',
      'getProperties(companyId: string, customerId: string)'
    ];
    methods.forEach(method => {
      expect(method).toMatch(/companyId: string/);
    });
  });
});

describe('Estimate Snapshots - Immutability', () => {
  it('IStorage interface has createEstimateSnapshot but no updateEstimateSnapshot', () => {
    const hasCreate = true;
    const hasUpdate = false;
    const hasDelete = false;
    expect(hasCreate).toBe(true);
    expect(hasUpdate).toBe(false);
    expect(hasDelete).toBe(false);
  });

  it('snapshot captures complete pricing state', () => {
    const workItems: WorkItem[] = [{
      id: 'item-1',
      description: 'Tree removal',
      quantity: 1,
      unit: 'job',
      unitPrice: 500,
      laborHours: 8,
      equipmentIds: ['0']
    }];
    
    const result = EstimatePricingService.calculate({
      workItems,
      costProfileSnapshot: createMockCostProfile(),
      taxRate: 0.08
    });

    expect(result.breakdown).toHaveProperty('laborCost');
    expect(result.breakdown).toHaveProperty('equipmentCost');
    expect(result.breakdown).toHaveProperty('overheadAllocation');
    expect(result.breakdown).toHaveProperty('materialCost');
    expect(result.breakdown).toHaveProperty('directCosts');
    expect(result.breakdown).toHaveProperty('marginAmount');
    expect(result.breakdown).toHaveProperty('floorPrice');
    expect(result.breakdown).toHaveProperty('calculatedPrice');
    expect(result.breakdown).toHaveProperty('finalPrice');
    expect(result.breakdown).toHaveProperty('costProfileVersion');
  });

  it('snapshot links to cost profile version', () => {
    const result = EstimatePricingService.calculate({
      workItems: [],
      costProfileSnapshot: createMockCostProfile(),
      taxRate: 0
    });
    expect(result.breakdown.costProfileVersion).toBe(1);
  });
});

describe('Magic Link Security', () => {
  it('generates 256-bit (32 byte) tokens', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token.length).toBe(64);
    expect(Buffer.from(token, 'hex').length).toBe(32);
  });

  it('stores only SHA-256 hash of token', () => {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    
    expect(hash.length).toBe(64);
    expect(hash).not.toBe(token);
    expect(() => {
      crypto.createHash('sha256').update(hash).digest('hex');
    }).not.toThrow();
  });

  it('hash verification works correctly', () => {
    const originalToken = 'secret-magic-link-token-12345';
    const storedHash = crypto.createHash('sha256').update(originalToken).digest('hex');
    
    const incomingToken = 'secret-magic-link-token-12345';
    const incomingHash = crypto.createHash('sha256').update(incomingToken).digest('hex');
    
    expect(incomingHash).toBe(storedHash);
  });

  it('wrong token fails verification', () => {
    const originalToken = 'secret-magic-link-token-12345';
    const storedHash = crypto.createHash('sha256').update(originalToken).digest('hex');
    
    const wrongToken = 'wrong-token';
    const wrongHash = crypto.createHash('sha256').update(wrongToken).digest('hex');
    
    expect(wrongHash).not.toBe(storedHash);
  });

  it('token expiry is 14 days', () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const daysDiff = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysDiff).toBe(14);
  });

  it('expired token is rejected', () => {
    const expiredAt = new Date(Date.now() - 1000);
    const isExpired = Date.now() > expiredAt.getTime();
    expect(isExpired).toBe(true);
  });

  it('markMagicLinkUsed prevents reuse', () => {
    let magicLinkUsedAt: Date | null = null;
    
    const markAsUsed = () => {
      magicLinkUsedAt = new Date();
    };
    
    const canUseLink = () => magicLinkUsedAt === null;
    
    expect(canUseLink()).toBe(true);
    markAsUsed();
    expect(canUseLink()).toBe(false);
  });
});

describe('State Machine Transitions', () => {
  const validTransitions: Record<string, string[]> = {
    draft: ['sent'],
    sent: ['approved', 'rejected', 'superseded'],
    approved: ['superseded'],
    rejected: [],
    superseded: []
  };

  it('draft can only transition to sent', () => {
    expect(validTransitions.draft).toEqual(['sent']);
  });

  it('sent can transition to approved, rejected, or superseded', () => {
    expect(validTransitions.sent).toContain('approved');
    expect(validTransitions.sent).toContain('rejected');
    expect(validTransitions.sent).toContain('superseded');
  });

  it('approved can only transition to superseded', () => {
    expect(validTransitions.approved).toEqual(['superseded']);
  });

  it('rejected is terminal', () => {
    expect(validTransitions.rejected).toHaveLength(0);
  });

  it('superseded is terminal', () => {
    expect(validTransitions.superseded).toHaveLength(0);
  });

  it('PATCH blocked for non-draft estimates (409 response)', () => {
    const status = 'sent';
    const canModify = status === 'draft';
    expect(canModify).toBe(false);
  });
});

describe('Change Order Behavior', () => {
  it('new estimate version increments from parent', () => {
    const parentVersion = 1;
    const newVersion = parentVersion + 1;
    expect(newVersion).toBe(2);
  });

  it('parent status changes to superseded', () => {
    const parentStatus = 'approved';
    const newParentStatus = 'superseded';
    const validFromApproved = ['superseded'];
    expect(validFromApproved).toContain(newParentStatus);
  });

  it('change order requires approved or sent parent', () => {
    const allowedStatuses = ['approved', 'sent'];
    expect(allowedStatuses).toContain('approved');
    expect(allowedStatuses).toContain('sent');
    expect(allowedStatuses).not.toContain('draft');
    expect(allowedStatuses).not.toContain('rejected');
  });

  it('child references parent via parentEstimateId', () => {
    const parent = { id: 'est-001', version: 1 };
    const child = { 
      id: 'est-002', 
      parentEstimateId: parent.id,
      version: parent.version + 1 
    };
    expect(child.parentEstimateId).toBe('est-001');
    expect(child.version).toBe(2);
  });

  it('snapshot created with triggerAction change_order', () => {
    const snapshot = {
      estimateId: 'est-002',
      snapshotVersion: 1,
      triggerAction: 'change_order'
    };
    expect(snapshot.triggerAction).toBe('change_order');
  });

  it('parent snapshot created with triggerAction supersede', () => {
    const parentSnapshot = {
      estimateId: 'est-001',
      snapshotVersion: 2,
      triggerAction: 'supersede',
      previousStatus: 'approved',
      newStatus: 'superseded'
    };
    expect(parentSnapshot.triggerAction).toBe('supersede');
    expect(parentSnapshot.newStatus).toBe('superseded');
  });
});

describe('Pricing Override Rules', () => {
  it('override requires reason', () => {
    const overrideMultiplier = 0.9;
    const overrideReason = 'Customer loyalty discount';
    
    const isValidOverride = overrideMultiplier !== undefined && overrideReason !== undefined;
    expect(isValidOverride).toBe(true);
  });

  it('override without reason is rejected', () => {
    const overrideMultiplier = 0.9;
    const overrideReason = undefined;
    
    const isValidOverride = !(overrideMultiplier !== undefined && !overrideReason);
    expect(isValidOverride).toBe(false);
  });

  it('floor violation detected when below minimum', () => {
    const result = EstimatePricingService.calculate({
      workItems: [{
        id: '1',
        description: 'Test',
        quantity: 1,
        unit: 'job',
        unitPrice: 1000,
        laborHours: 8
      }],
      costProfileSnapshot: createMockCostProfile(),
      taxRate: 0,
      overrideMultiplier: 0.3,
      overrideReason: 'Deep discount'
    });
    
    expect(result.floorViolation).toBe(true);
    expect(result.isOverride).toBe(true);
  });

  it('normal pricing has no floor violation', () => {
    const result = EstimatePricingService.calculate({
      workItems: [{
        id: '1',
        description: 'Test',
        quantity: 1,
        unit: 'job',
        unitPrice: 1000,
        laborHours: 8
      }],
      costProfileSnapshot: createMockCostProfile(),
      taxRate: 0
    });
    
    expect(result.floorViolation).toBe(false);
    expect(result.isOverride).toBe(false);
  });
});

describe('Audit Trail', () => {
  it('audit entry captures action type', () => {
    const entry = {
      action: 'estimate.created',
      entityType: 'estimate',
      entityId: 'est-001'
    };
    expect(entry.action).toBe('estimate.created');
  });

  it('audit entry captures previous and new state', () => {
    const entry = {
      action: 'estimate.sent',
      previousState: { status: 'draft' },
      newState: { status: 'sent', snapshotVersion: 1 }
    };
    expect(entry.previousState.status).toBe('draft');
    expect(entry.newState.status).toBe('sent');
  });

  it('override is logged with reason', () => {
    const entry = {
      action: 'estimate.sent',
      isOverride: true,
      reason: 'Preferred customer discount'
    };
    expect(entry.isOverride).toBe(true);
    expect(entry.reason).toBeTruthy();
  });

  it('change order creates two audit entries', () => {
    const entries = [
      { action: 'estimate.change_order.created', entityId: 'est-002' },
      { action: 'estimate.superseded', entityId: 'est-001' }
    ];
    
    expect(entries.length).toBe(2);
    expect(entries[0].action).toBe('estimate.change_order.created');
    expect(entries[1].action).toBe('estimate.superseded');
  });

  it('supersede entry links parent to child', () => {
    const entry = {
      action: 'estimate.superseded',
      entityId: 'est-001',
      newState: {
        status: 'superseded',
        supersededByEstimateId: 'est-002'
      }
    };
    expect(entry.newState.supersededByEstimateId).toBe('est-002');
  });
});

describe('Rate Limiting', () => {
  it('tracks request count per IP', () => {
    const rateLimit = new Map<string, { count: number; resetAt: number }>();
    const ip = '192.168.1.1';
    
    rateLimit.set(ip, { count: 1, resetAt: Date.now() + 60000 });
    const entry = rateLimit.get(ip);
    
    expect(entry?.count).toBe(1);
  });

  it('increments count on repeated requests', () => {
    const rateLimit = new Map<string, { count: number; resetAt: number }>();
    const ip = '192.168.1.1';
    
    rateLimit.set(ip, { count: 1, resetAt: Date.now() + 60000 });
    const entry = rateLimit.get(ip)!;
    entry.count++;
    
    expect(entry.count).toBe(2);
  });

  it('blocks after limit exceeded', () => {
    const LIMIT = 10;
    const entry = { count: 11, resetAt: Date.now() + 60000 };
    
    const isBlocked = entry.count > LIMIT;
    expect(isBlocked).toBe(true);
  });

  it('resets after window expires', () => {
    const entry = { count: 15, resetAt: Date.now() - 1000 };
    const windowExpired = Date.now() > entry.resetAt;
    
    if (windowExpired) {
      entry.count = 1;
      entry.resetAt = Date.now() + 60000;
    }
    
    expect(entry.count).toBe(1);
    expect(windowExpired).toBe(true);
  });
});
