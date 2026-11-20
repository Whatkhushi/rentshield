import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { logger } from '../../logger.js';
import { accessFor } from '../../lib/access.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { stageOf } from '../leases/leases.routes.js';
import { totals } from '../settlements/settlements.routes.js';
import { faqAnswer } from './faq.js';
import { ASSISTANT_GUIDE } from './guide.js';
import { getProvider, QuotaError } from './providers.js';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

/** Which mode the Help button runs in: an AI provider, or the built-in FAQ. */
assistantRouter.get('/status', (_req, res) => {
  const provider = getProvider();
  res.json({ enabled: true, mode: provider?.name ?? 'faq' });
});

/**
 * Amounts written the Indian way (1,50,000) plus words, so the model can't
 * mis-group the digits (it once read 150000 as 1,500,000).
 */
const words = (n: number) =>
  n >= 1_00_00_000
    ? `${+(n / 1_00_00_000).toFixed(2)} crore`
    : n >= 1_00_000
      ? `${+(n / 1_00_000).toFixed(2)} lakh`
      : n >= 1000
        ? `${+(n / 1000).toFixed(2)} thousand`
        : String(n);
const inrText = (n: number) => `${n.toLocaleString('en-IN')} (${words(n)})`;

// Each AI message costs money or free quota: cap it per user.
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `assistant:${req.user?.sub}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Youâ€™ve asked a lot of questions in a short time. Please wait a few minutes.' } },
});

/**
 * A short, factual summary of the tenancy for the model. Roles and counts
 * only: no names, emails or photos leave the server.
 */
async function tenancyContext(leaseId: number, me: number): Promise<{ text: string; stage?: string }> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      property: { include: { rooms: true } },
      inspections: { include: { items: { select: { name: true, condition: true, reviewStatus: true, roomId: true } } } },
      settlement: { include: { deductions: { select: { reason: true, amount: true, status: true } } } },
    },
  });
  if (!lease) return { text: '' };
  const { role, otherPartyId } = accessFor(lease, me); // throws 404 for non-members
  const stage = stageOf(lease, lease.inspections, lease.settlement);
  const rooms = new Map(lease.property.rooms.map((r) => [r.id, r.name]));
  const lines = [
    `The user is the ${role.toLowerCase()} of a tenancy in ${lease.property.city} (${lease.property.propertyType.toLowerCase()}, ${lease.property.rooms.length} rooms).`,
    `Monthly rent Rs ${inrText(lease.monthlyRent)}, deposit Rs ${inrText(lease.securityDeposit)}. Map pin set: ${lease.property.latitude !== null ? 'yes' : 'no'}.`,
    `Other party (${role === 'TENANT' ? 'landlord' : 'tenant'}) joined: ${otherPartyId ? 'yes' : 'no, an invite link is still needed'}.`,
    `Current stage: ${stage}.`,
  ];
  for (const i of lease.inspections) {
    const c = (s: string) => i.items.filter((x) => x.reviewStatus === s).length;
    const disputed = i.items.filter((x) => x.reviewStatus === 'DISPUTED').map((x) => `${rooms.get(x.roomId)} / ${x.name}`);
    lines.push(
      `${i.type === 'MOVE_IN' ? 'Move-in' : 'Move-out'} inspection: status ${i.status}, documented by the ${i.authorId === me ? 'user' : 'other party'}, ` +
        `${i.items.length} items, ${i.items.filter((x) => x.condition).length} have a condition, ${c('APPROVED')} approved, ${c('NOTED')} disagreements recorded, ${c('DISPUTED')} sent back, ${c('PENDING')} awaiting review.` +
        (disputed.length ? ` Sent back: ${disputed.slice(0, 8).join('; ')}.` : ''),
    );
  }
  if (lease.settlement) {
    const t = totals(lease.settlement, lease.settlement.deductions);
    lines.push(
      `Settlement: ${lease.settlement.status}. Deposit Rs ${inrText(t.deposit)}, accepted deductions Rs ${inrText(t.accepted)}, still open Rs ${inrText(t.open)} (${t.unresolvedCount} items).` +
        (lease.settlement.finalRefund !== null ? ` Final refund Rs ${inrText(lease.settlement.finalRefund)}.` : ''),
    );
    for (const d of lease.settlement.deductions.slice(0, 10)) lines.push(`- Deduction Rs ${inrText(d.amount)} (${d.status.toLowerCase()}): ${d.reason}`);
  }
  return { text: lines.join('\n'), stage };
}

const chatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(24)
    .refine((m) => m[0].role === 'user' && m[m.length - 1].role === 'user', 'Conversation must start and end with the user'),
  leaseId: z.number().int().positive().optional(),
  uiLanguage: z.enum(['en', 'hi']).default('en'),
});

/**
 * Streams the reply as Server-Sent Events:
 *   data: {"mode": "gemini" | "claude" | "faq"}
 *   data: {"text": "..."}   pieces of the answer as they're written
 *   data: {"done": true}    end of the answer
 *   data: {"error": "..."}  something went wrong mid-way
 */
assistantRouter.post('/chat', limiter, validate({ body: chatBody }), async (req, res) => {
  const { messages, leaseId, uiLanguage } = res.locals.body as z.infer<typeof chatBody>;
  const ctx = leaseId ? await tenancyContext(leaseId, userId(req)) : { text: '' };
  const question = messages[messages.length - 1].content;
  const provider = getProvider();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  // No AI configured: answer from the built-in FAQ.
  if (!provider) {
    send({ mode: 'faq' });
    send({ text: faqAnswer(question, uiLanguage, ctx.stage) });
    send({ done: true });
    return res.end();
  }

  // Stop paying for tokens nobody will read if the user closes the chat.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  send({ mode: provider.name });
  let wrote = false;
  try {
    const result = await provider.stream({
      system: ASSISTANT_GUIDE,
      context: `Interface language: ${uiLanguage === 'hi' ? 'Hindi' : 'English'}.\n${ctx.text ? `TENANCY CONTEXT\n${ctx.text}` : 'The user is not looking at a specific tenancy right now.'}`,
      messages,
      signal: abort.signal,
      onText: (t) => {
        wrote = true;
        send({ text: t });
      },
    });
    if (result.refused) send({ text: '\n\nSorry, I canâ€™t help with that. I can answer questions about using RentShield and your tenancy.' });
    else if (result.truncated) send({ text: 'â€¦' });
    send({ done: true });
  } catch (err) {
    if (abort.signal.aborted || res.destroyed) return;
    if (err instanceof QuotaError && !wrote) {
      // Free AI quota used up: still help, from the FAQ.
      send({ mode: 'faq' });
      send({ text: faqAnswer(question, uiLanguage, ctx.stage) });
      send({ done: true });
    } else {
      logger.error({ err: (err as Error).message, provider: provider.name }, 'Assistant failed');
      send({ error: 'The assistant couldnâ€™t answer just now. Please try again.' });
    }
  } finally {
    res.end();
  }
});
