import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, bearer, newUser, resetDb, tenancy } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// These tests never reach the Claude API (no key in the test environment),
// so they cost nothing; they check the guard rails around it.
describe('help assistant', () => {
  it('reports itself disabled and refuses politely without an API key', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const u = await newUser();
      const status = await api().get('/api/v1/assistant/status').set(bearer(u.token)).expect(200);
      expect(status.body.enabled).toBe(false);
      const r = await api()
        .post('/api/v1/assistant/chat')
        .set(bearer(u.token))
        .send({ messages: [{ role: 'user', content: 'How do I invite my landlord?' }] })
        .expect(503);
      expect(r.body.error.code).toBe('ASSISTANT_NOT_CONFIGURED');
    } finally {
      if (saved) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it('requires login', async () => {
    await api().post('/api/v1/assistant/chat').send({ messages: [{ role: 'user', content: 'hi' }] }).expect(401);
  });

  it('validates the conversation shape', async () => {
    const u = await newUser();
    await api()
      .post('/api/v1/assistant/chat')
      .set(bearer(u.token))
      .send({ messages: [{ role: 'assistant', content: 'I start' }] })
      .expect(400);
  });

  it('never builds context from a tenancy the user is not part of', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
    try {
      const { leaseId } = await tenancy();
      const stranger = await newUser();
      await api()
        .post('/api/v1/assistant/chat')
        .set(bearer(stranger.token))
        .send({ leaseId, messages: [{ role: 'user', content: 'What is the deposit?' }] })
        .expect(404);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
