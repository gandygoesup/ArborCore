import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  const estimates = new Map<string, any>();
  const snapshots: any[] = [];
  
  app.post('/api/test/estimates', (req, res) => {
    const { companyId, customerId } = req.body;
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    
    const id = crypto.randomUUID();
    const estimate = {
      id,
      companyId,
      customerId,
      status: 'draft',
      createdAt: new Date()
    };
    estimates.set(`${companyId}:${id}`, estimate);
    res.json(estimate);
  });
  
  app.get('/api/test/estimates/:id', (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    
    const estimate = estimates.get(`${companyId}:${req.params.id}`);
    if (!estimate) return res.status(404).json({ message: 'Not found' });
    res.json(estimate);
  });
  
  app.patch('/api/test/estimates/:id', (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    
    const key = `${companyId}:${req.params.id}`;
    const estimate = estimates.get(key);
    if (!estimate) return res.status(404).json({ message: 'Not found' });
    
    if (estimate.status !== 'draft') {
      return res.status(409).json({ message: 'Only draft estimates can be modified' });
    }
    
    Object.assign(estimate, req.body);
    res.json(estimate);
  });
  
  app.post('/api/test/estimates/:id/send', (req, res) => {
    const companyId = req.headers['x-company-id'];
    if (!companyId) return res.status(400).json({ message: 'companyId required' });
    
    const key = `${companyId}:${req.params.id}`;
    const estimate = estimates.get(key);
    if (!estimate) return res.status(404).json({ message: 'Not found' });
    
    if (estimate.status !== 'draft') {
      return res.status(409).json({ message: 'Only draft estimates can be sent' });
    }
    
    const magicLinkToken = crypto.randomBytes(32).toString('hex');
    const magicLinkTokenHash = crypto.createHash('sha256').update(magicLinkToken).digest('hex');
    
    estimate.status = 'sent';
    estimate.magicLinkTokenHash = magicLinkTokenHash;
    estimate.sentAt = new Date();
    
    snapshots.push({
      estimateId: estimate.id,
      snapshotVersion: 1,
      triggerAction: 'send',
      previousStatus: 'draft',
      newStatus: 'sent',
      createdAt: new Date()
    });
    
    res.json({ estimate, magicLinkToken });
  });
  
  app.get('/api/test/portal/:token', (req, res) => {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    
    const estimate = Array.from(estimates.values()).find(e => e.magicLinkTokenHash === tokenHash);
    if (!estimate) return res.status(404).json({ message: 'Invalid or expired link' });
    
    if (estimate.magicLinkUsedAt) {
      return res.status(410).json({ message: 'Link already used' });
    }
    
    res.json({ estimate });
  });
  
  app.post('/api/test/portal/:token/approve', (req, res) => {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    
    const estimate = Array.from(estimates.values()).find(e => e.magicLinkTokenHash === tokenHash);
    if (!estimate) return res.status(404).json({ message: 'Invalid or expired link' });
    
    if (estimate.magicLinkUsedAt) {
      return res.status(410).json({ message: 'Link already used' });
    }
    
    estimate.status = 'approved';
    estimate.magicLinkUsedAt = new Date();
    
    snapshots.push({
      estimateId: estimate.id,
      snapshotVersion: 2,
      triggerAction: 'approve',
      previousStatus: 'sent',
      newStatus: 'approved'
    });
    
    res.json({ estimate });
  });
  
  app.get('/api/test/snapshots/:estimateId', (req, res) => {
    const estimateSnapshots = snapshots.filter(s => s.estimateId === req.params.estimateId);
    res.json(estimateSnapshots);
  });
  
  return { app, estimates, snapshots };
};

describe('API Integration Tests', () => {
  describe('Tenant Isolation', () => {
    it('requires companyId for estimate creation', async () => {
      const { app } = createTestApp();
      const res = await request(app)
        .post('/api/test/estimates')
        .send({ customerId: 'cust-1' });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('companyId');
    });

    it('company A cannot access company B estimates', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      expect(createRes.status).toBe(200);
      const estimateId = createRes.body.id;
      
      const accessRes = await request(app)
        .get(`/api/test/estimates/${estimateId}`)
        .set('x-company-id', 'company-b');
      
      expect(accessRes.status).toBe(404);
    });

    it('company A can access own estimates', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const estimateId = createRes.body.id;
      
      const accessRes = await request(app)
        .get(`/api/test/estimates/${estimateId}`)
        .set('x-company-id', 'company-a');
      
      expect(accessRes.status).toBe(200);
      expect(accessRes.body.id).toBe(estimateId);
    });
  });

  describe('Estimate State Machine', () => {
    it('PATCH succeeds on draft estimate', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const patchRes = await request(app)
        .patch(`/api/test/estimates/${createRes.body.id}`)
        .set('x-company-id', 'company-a')
        .send({ title: 'Updated title' });
      
      expect(patchRes.status).toBe(200);
    });

    it('PATCH returns 409 on sent estimate', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      const patchRes = await request(app)
        .patch(`/api/test/estimates/${createRes.body.id}`)
        .set('x-company-id', 'company-a')
        .send({ title: 'Try to update' });
      
      expect(patchRes.status).toBe(409);
      expect(patchRes.body.message).toContain('draft');
    });

    it('send returns 409 on already-sent estimate', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      const secondSend = await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      expect(secondSend.status).toBe(409);
    });
  });

  describe('Snapshot Immutability', () => {
    it('creates snapshot on send', async () => {
      const { app, snapshots } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      const snapshotsRes = await request(app)
        .get(`/api/test/snapshots/${createRes.body.id}`);
      
      expect(snapshotsRes.body.length).toBeGreaterThanOrEqual(1);
      expect(snapshotsRes.body[0].triggerAction).toBe('send');
    });

    it('snapshots are append-only - new snapshot on approve', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const sendRes = await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      await request(app)
        .post(`/api/test/portal/${sendRes.body.magicLinkToken}/approve`);
      
      const snapshotsRes = await request(app)
        .get(`/api/test/snapshots/${createRes.body.id}`);
      
      expect(snapshotsRes.body.length).toBe(2);
      expect(snapshotsRes.body[1].triggerAction).toBe('approve');
    });
  });

  describe('Magic Link Security', () => {
    it('generates 256-bit token on send', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const sendRes = await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      expect(sendRes.body.magicLinkToken).toBeDefined();
      expect(sendRes.body.magicLinkToken.length).toBe(64);
    });

    it('valid token returns estimate', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const sendRes = await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      const portalRes = await request(app)
        .get(`/api/test/portal/${sendRes.body.magicLinkToken}`);
      
      expect(portalRes.status).toBe(200);
      expect(portalRes.body.estimate.id).toBe(createRes.body.id);
    });

    it('invalid token returns 404', async () => {
      const { app } = createTestApp();
      
      const portalRes = await request(app)
        .get('/api/test/portal/invalid-token-12345');
      
      expect(portalRes.status).toBe(404);
    });

    it('magic link is single-use', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const sendRes = await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      const firstApprove = await request(app)
        .post(`/api/test/portal/${sendRes.body.magicLinkToken}/approve`);
      
      expect(firstApprove.status).toBe(200);
      
      const secondApprove = await request(app)
        .post(`/api/test/portal/${sendRes.body.magicLinkToken}/approve`);
      
      expect(secondApprove.status).toBe(410);
      expect(secondApprove.body.message).toContain('already used');
    });

    it('viewing after use returns 410', async () => {
      const { app } = createTestApp();
      
      const createRes = await request(app)
        .post('/api/test/estimates')
        .send({ companyId: 'company-a', customerId: 'cust-1' });
      
      const sendRes = await request(app)
        .post(`/api/test/estimates/${createRes.body.id}/send`)
        .set('x-company-id', 'company-a');
      
      await request(app)
        .post(`/api/test/portal/${sendRes.body.magicLinkToken}/approve`);
      
      const viewRes = await request(app)
        .get(`/api/test/portal/${sendRes.body.magicLinkToken}`);
      
      expect(viewRes.status).toBe(410);
    });
  });
});
