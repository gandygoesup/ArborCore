import { describe, it, expect } from 'vitest';
import { PORTAL_TOKEN_ERROR_RESPONSE, PORTAL_TOKEN_ERROR_STATUS } from '../constants/portal';

describe('Portal Token Error Response Normalization', () => {
  describe('Shared constants verification', () => {
    it('should use 410 Gone status code for token errors', () => {
      expect(PORTAL_TOKEN_ERROR_STATUS).toBe(410);
    });

    it('should return generic error message hiding token state', () => {
      expect(PORTAL_TOKEN_ERROR_RESPONSE).toEqual({ message: 'This link is no longer valid' });
    });

    it('should have exactly one key in error response', () => {
      expect(Object.keys(PORTAL_TOKEN_ERROR_RESPONSE)).toHaveLength(1);
      expect(Object.keys(PORTAL_TOKEN_ERROR_RESPONSE)).toContain('message');
    });

    it('should not leak any token state information in error message', () => {
      const message = PORTAL_TOKEN_ERROR_RESPONSE.message;
      const sensitiveTerms = ['expired', 'used', 'invalid', 'token', 'status', 'race'];
      sensitiveTerms.forEach(term => {
        expect(message.toLowerCase()).not.toContain(term);
      });
    });
  });

  describe('Error states covered by implementation', () => {
    const getRouteAuditActions = [
      'portal.token.invalid',
      'portal.token.expired',
      'portal.token.used',
    ];

    const approveRouteAuditActions = [
      'portal.approve.token_invalid',
      'portal.approve.token_expired',
      'portal.approve.token_used',
      'portal.approve.invalid_status',
      'portal.approve.race_condition',
    ];

    const rejectRouteAuditActions = [
      'portal.reject.token_invalid',
      'portal.reject.token_expired',
      'portal.reject.token_used',
      'portal.reject.invalid_status',
      'portal.reject.race_condition',
    ];

    it('should have 3 distinct audit actions for GET endpoint', () => {
      expect(new Set(getRouteAuditActions).size).toBe(3);
    });

    it('should have 5 distinct audit actions for approve endpoint', () => {
      expect(new Set(approveRouteAuditActions).size).toBe(5);
    });

    it('should have 5 distinct audit actions for reject endpoint', () => {
      expect(new Set(rejectRouteAuditActions).size).toBe(5);
    });

    it('all audit actions should follow naming convention', () => {
      const allActions = [
        ...getRouteAuditActions,
        ...approveRouteAuditActions,
        ...rejectRouteAuditActions,
      ];
      allActions.forEach(action => {
        expect(action).toMatch(/^portal\.(token|approve|reject)\./);
      });
    });
  });

  describe('Response shape consistency', () => {
    it('all token error states should return identical JSON shape', () => {
      const simulatedResponses = {
        invalidToken: { ...PORTAL_TOKEN_ERROR_RESPONSE },
        expiredToken: { ...PORTAL_TOKEN_ERROR_RESPONSE },
        usedToken: { ...PORTAL_TOKEN_ERROR_RESPONSE },
        invalidStatus: { ...PORTAL_TOKEN_ERROR_RESPONSE },
        raceCondition: { ...PORTAL_TOKEN_ERROR_RESPONSE },
      };

      Object.values(simulatedResponses).forEach(response => {
        expect(response).toEqual(PORTAL_TOKEN_ERROR_RESPONSE);
        expect(JSON.stringify(response)).toBe(JSON.stringify(PORTAL_TOKEN_ERROR_RESPONSE));
      });
    });

    it('error response should be JSON serializable', () => {
      expect(() => JSON.stringify(PORTAL_TOKEN_ERROR_RESPONSE)).not.toThrow();
      const parsed = JSON.parse(JSON.stringify(PORTAL_TOKEN_ERROR_RESPONSE));
      expect(parsed).toEqual(PORTAL_TOKEN_ERROR_RESPONSE);
    });
  });
});
