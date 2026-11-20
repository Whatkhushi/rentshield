import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { logger } from '../../logger.js';
import { accessFor } from '../../lib/access.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth, userId } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { stageOf } from '../leases/leases.routes.js';
import { totals } from '../settlements/settlements.routes.js';
import { ASSISTANT_GUIDE } from './guide.js';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

const MODEL = 'claude-opus-5-5';

/** The assistant is optional: without credentials the endpoint explains how to enable it. */
const configured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

assistantRouter.get('/status', (_req, res) => {
  res.json({ enabled: configured() });
});

// Each message costs money: cap it per user.
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `assistant:${req.user?.sub}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'You’ve asked a lot of questions in a short time. Please wait a few minutes.' } },
});

/**
 * A short, factual summary of the tenancy for the model. Roles and counts
 * only: no names, emails or photos leave the server.
 */
async function tenancyContext(leaseId: number, me: number): Promise<string> {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: {
      property: { include: { rooms: true } },
      inspections: { include: { items: { select: { name: true, condition: true, reviewStatus: true, roomId: true } } } },
      settlement: { include: { deductions: { select: { reason: true, amount: true, status: true } } } },
    },
  });
  if (!lease) return '';
  const { role, otherPartyId } = accessFor(lease, me); // throws 404 for non-members
  const rooms = new Map(lease.property.rooms.map((r) => [r.id, r.name]));
  const lines = [
    `The user is the ${role.toLowerCase()} of a tenancy in ${lease.property.city} (${lease.property.propertyType.toLowerCase()}, ${lease.property.rooms.length} rooms).`,
    `Monthly rent Rs ${lease.monthlyRent}, deposit Rs ${lease.securityDeposit}. Map pin set: ${lease.property.latitude !== null ? 'yes' : 'no'}.`,
    `Other party (${role === 'TENANT' ? 'landlord' : 'tenant'}) joined: ${otherPartyId ? 'yes' : 'no, an invite link is still needed'}.`,
    `Current stage: ${stageOf(lease, lease.inspections, lease.settlement)}.`,
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
      `Settlement: ${lease.settlement.status}. Deposit Rs ${t.deposit}, accepted deductions Rs ${t.accepted}, still open Rs ${t.open} (${t.unresolvedCount} items).` +
        (lease.settlement.finalRefund !== null ? ` Final refund Rs ${lease.settlement.finalRefund}.` : ''),
    );
    for (const d of lease.settlement.deductions.slice(0, 10)) lines.push(`- Deduction Rs ${d.amount} (${d.status.toLowerCase()}): ${d.reason}`);
  }
  return lines.join('\n');
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
 *   data: {"text": "..."}   pieces of the answer as they're written
 *   data: {"done": true}    end of the answer
 *   data: {"error": "..."}  something went wrong mid-way
 */
assistantRouter.post('/chat', limiter, validate({ body: chatBody }), async (req, res) => {
  if (!configured()) {
    throw new ApiError(503, 'ASSISTANT_NOT_CONFIGURED', 'The help assistant isn’t switched on yet. The server needs an ANTHROPIC_API_KEY.');
  }
  const { messages, leaseId, uiLanguage } = res.locals.body as z.infer<typeof chatBody>;
  const context = leaseId ? await tenancyContext(leaseId, userId(req)) : '';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 4000, // help answers are short by design; also a per-reply cost cap
    // Chat doesn't need deep reasoning: low effort keeps replies quick.
    output_config: { effort: 'low' },
    // If a safety classifier declines, retry on a suitable fallback model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      { type: 'text', text: ASSISTANT_GUIDE, cache_control: { type: 'ephemeral' } },
      {
        type: 'text',
        text: `Interface language: ${uiLanguage === 'hi' ? 'Hindi' : 'English'}.\n${context ? `TENANCY CONTEXT\n${context}` : 'The user is not looking at a specific tenancy right now.'}`,
      },
    ],
    messages,
  });

  // Stop paying for tokens nobody will read if the user closes the chat.
  res.on('close', () => {
    if (!res.writableEnded) stream.abort();
  });
  stream.on('text', (delta) => send({ text: delta }));

  try {
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send({ text: '\n\nSorry, I can’t help with that. I can answer questions about using RentShield and your tenancy.' });
    } else if (final.stop_reason === 'max_tokens') {
      send({ text: '…' });
    }
    send({ done: true });
  } catch (err) {
    if (res.writableEnded || res.destroyed) return; // client went away
    let message = 'The assistant couldn’t answer just now. Please try again.';
    if (err instanceof Anthropic.AuthenticationError) message = 'The assistant’s API key is invalid. Ask the site owner to check ANTHROPIC_API_KEY.';
    else if (err instanceof Anthropic.RateLimitError) message = 'The assistant is busy right now. Please try again in a minute.';
    else if (err instanceof Anthropic.APIError) logger.error({ status: err.status, message: err.message }, 'Assistant API error');
    else logger.error({ err }, 'Assistant stream failed');
    send({ error: message });
  } finally {
    res.end();
  }
});
