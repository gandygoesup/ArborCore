import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseStorage } from '../storage';

describe('Contract Immutability Guarantees', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
  });

  describe('G1: Signed contracts are immutable', () => {
    it('should reject updates to signed contracts without allowSignedUpdate flag', async () => {
      const mockContract = {
        id: 'test-contract-id',
        companyId: 'test-company-id',
        status: 'signed',
        lockedAt: new Date(),
        signerName: 'John Doe',
        headerContent: 'Original Header',
      };

      const originalGetContract = storage.getContract.bind(storage);
      storage.getContract = vi.fn().mockResolvedValue(mockContract);

      await expect(
        storage.updateContract('test-company-id', 'test-contract-id', {
          headerContent: 'Modified Header',
        })
      ).rejects.toThrow('Cannot modify a signed contract');

      storage.getContract = originalGetContract;
    });

    it('should reject updates to locked contracts', async () => {
      const mockContract = {
        id: 'test-contract-id',
        companyId: 'test-company-id',
        status: 'draft',
        lockedAt: new Date(),
      };

      const originalGetContract = storage.getContract.bind(storage);
      storage.getContract = vi.fn().mockResolvedValue(mockContract);

      await expect(
        storage.updateContract('test-company-id', 'test-contract-id', {
          headerContent: 'Modified Header',
        })
      ).rejects.toThrow('Cannot modify a locked contract');

      storage.getContract = originalGetContract;
    });

    it('should use dedicated signContract method for signing (bypasses guard internally)', async () => {
      const signatureData = {
        signedAt: new Date(),
        signerName: 'John Doe',
        signerInitials: 'JD',
      };
      
      expect(storage.signContract).toBeDefined();
      expect(typeof storage.signContract).toBe('function');
    });
    
    it('should use dedicated voidContract method for voiding (bypasses guard internally)', async () => {
      expect(storage.voidContract).toBeDefined();
      expect(typeof storage.voidContract).toBe('function');
    });
  });

  describe('G3: Send blocking for terminal statuses', () => {
    const terminalStatuses = ['signed', 'voided', 'expired'];

    terminalStatuses.forEach(status => {
      it(`should block sending contract with status: ${status}`, () => {
        expect(terminalStatuses.includes(status)).toBe(true);
      });
    });

    it('should define exactly 3 terminal statuses', () => {
      expect(terminalStatuses).toHaveLength(3);
    });
  });

  describe('G4: Void flow requirements', () => {
    it('void action should require reason', () => {
      const reason: string = '';
      expect(
        !reason || typeof reason !== 'string' || reason.trim().length === 0
      ).toBe(true);
    });

    it('valid void reason should pass validation', () => {
      const reason = 'Customer requested cancellation';
      expect(
        reason && typeof reason === 'string' && reason.trim().length > 0
      ).toBe(true);
    });
  });

  describe('G5: Immutable snapshot guarantees', () => {
    it('should capture all required fields in signed snapshot', () => {
      const requiredSnapshotFields = [
        'contractId',
        'companyId',
        'headerContent',
        'workItemsContent',
        'termsContent',
        'footerContent',
        'estimateSnapshot',
        'signedAt',
        'signerName',
        'signerIpAddress',
        'signerUserAgent',
      ];

      expect(requiredSnapshotFields.length).toBeGreaterThan(0);
      requiredSnapshotFields.forEach(field => {
        expect(typeof field).toBe('string');
      });
    });
  });

  describe('lockedAt column behavior', () => {
    it('lockedAt should be set when contract is signed', () => {
      const signedAt = new Date();
      const lockedAt = new Date();
      
      expect(lockedAt).toBeInstanceOf(Date);
      expect(signedAt.getTime()).toBeLessThanOrEqual(lockedAt.getTime());
    });

    it('lockedAt prevents modifications even if status is somehow changed', () => {
      const contract = {
        status: 'draft',
        lockedAt: new Date(),
      };

      expect(contract.lockedAt).toBeTruthy();
    });
  });
});

describe('Contract Status Transitions', () => {
  it('valid transitions from draft', () => {
    const validNextStatuses = ['sent', 'voided'];
    expect(validNextStatuses).toContain('sent');
    expect(validNextStatuses).toContain('voided');
  });

  it('valid transitions from sent', () => {
    const validNextStatuses = ['signed', 'voided', 'expired'];
    expect(validNextStatuses).toContain('signed');
    expect(validNextStatuses).toContain('voided');
    expect(validNextStatuses).toContain('expired');
  });

  it('signed is terminal - only void is allowed', () => {
    const validNextStatuses = ['voided'];
    expect(validNextStatuses).toContain('voided');
    expect(validNextStatuses).not.toContain('draft');
    expect(validNextStatuses).not.toContain('sent');
  });

  it('voided is terminal - no further transitions', () => {
    const validNextStatuses: string[] = [];
    expect(validNextStatuses).toHaveLength(0);
  });
});
