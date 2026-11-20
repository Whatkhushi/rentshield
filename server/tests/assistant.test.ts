import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { faqAnswer } from '../src/modules/assistant/faq.js';
import { resetProvider } from '../src/modules/assistant/providers.js';
import { api, bearer, newUser, resetDb, tenancy } from './helpers.js';

const KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(async () => {
  await resetDb();
  // These tests never call a real AI (no keys), so they cost nothing.
  for (const k of KEYS) delete process.env[k];
  resetProvider();
});
afterAll(async () => {
  for (const k of KEYS) if (saved[k]) process.env[k] = saved[k];
  resetProvider();
  await prisma.$disconnect();
});

/** Collect the text pieces from a Server-Sent Events response body. */
function sseText(body: string) {
  return body
    .split('\n\n')
    .filter((c) => c.startsWith('data: '))
    .map((c) => JSON.parse(c.slice(6)))
    .reduce((acc: { text: string; mode?: string }, e) => ({ text: acc.text + (e.text ?? ''), mode: e.mode ?? acc.mode }), { text: '' });
}

describe('help assistant', () => {
  it('works with no AI key at all, answering from the built-in FAQ', async () => {
    const u = await newUser();
    const status = await api().get('/api/v1/assistant/status').set(bearer(u.token)).expect(200);
    expect(status.body).toMatchObject({ enabled: true, mode: 'faq' });

    const r = await api()
      .post('/api/v1/assistant/chat')
      .set(bearer(u.token))
      .send({ messages: [{ role: 'user', content: 'How do I invite my landlord?' }] })
      .expect(200);
    const { text, mode } = sseText(r.text);
    expect(mode).toBe('faq');
    expect(text).toMatch(/Create invite link/);
  });

  it('answers in Hindi when asked in Hindi', () => {
    expect(faqAnswer('मकान मालिक को कैसे बुलाऊँ?', 'en')).toMatch(/इनवाइट लिंक/);
    expect(faqAnswer('deposit kitna hona chahiye', 'en')).toMatch(/Model Tenancy Act/);
  });

  it('uses the tenancy’s real stage for “what next?”', async () => {
    const { tenant, leaseId } = await tenancy();
    const r = await api()
      .post('/api/v1/assistant/chat')
      .set(bearer(tenant.token))
      .send({ leaseId, messages: [{ role: 'user', content: 'What should I do next?' }] })
      .expect(200);
    expect(sseText(r.text).text).toMatch(/move-in inspection/i);
  });

  it('selects Gemini when a Gemini key is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-used';
    resetProvider();
    const u = await newUser();
    const status = await api().get('/api/v1/assistant/status').set(bearer(u.token)).expect(200);
    expect(status.body.mode).toBe('gemini');
  });

  it('requires login and validates the conversation', async () => {
    await api().post('/api/v1/assistant/chat').send({ messages: [{ role: 'user', content: 'hi' }] }).expect(401);
    const u = await newUser();
    await api()
      .post('/api/v1/assistant/chat')
      .set(bearer(u.token))
      .send({ messages: [{ role: 'assistant', content: 'I start' }] })
      .expect(400);
  });

  it('never builds context from a tenancy the user is not part of', async () => {
    const { leaseId } = await tenancy();
    const stranger = await newUser();
    await api()
      .post('/api/v1/assistant/chat')
      .set(bearer(stranger.token))
      .send({ leaseId, messages: [{ role: 'user', content: 'What is the deposit?' }] })
      .expect(404);
  });
});
