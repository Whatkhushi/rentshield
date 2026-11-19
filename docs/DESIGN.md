# RentShield: Design Document

## 1. Problem

In Indian cities a tenant typically pays a security deposit of 2 to 10 months' rent. When they move out, disputes are common:

- The landlord deducts for "damage" that the tenant says was already there at move-in.
- Neither side has organised proof of the flat's condition on day one. At best there are scattered WhatsApp photos the other party never agreed to.
- Deductions arrive as a single number with no breakdown, no evidence and no way to challenge individual items.

Joint handover inspections with photos, meter readings and written records are the commonly recommended way to prevent this. Doing that well on paper or WhatsApp is hard, and the main existing tools are part of broker CRMs or paid property-management services.

**Positioning:** a simple, independent rental handover and deposit settlement tool that an individual tenant and landlord use directly. Not a property marketplace, not a broker CRM, not an all-in-one landlord suite.

## 2. The one workflow

```
 Create tenancy ──► Invite other party ──► Move-in inspection ──► Both agree, record locked
                                                                         │
                                                                   (months later)
                                                                         ▼
 PDF report ◄── Both confirm settlement ◄── Deductions + responses ◄── Move-out inspection
                                                                     + photo comparison
```

## 3. Features (v1 scope)

| # | Feature | What it does |
|---|---|---|
| 1 | **Joint inspection** | Rooms with standard checklists. Condition + notes + photos per item. Electricity/water/gas meter readings. The other party approves or disputes each item; disputed items are revised and re-reviewed until everything is agreed, then the record locks. |
| 2 | **Tamper-evident evidence** | Every uploaded file gets a SHA-256 fingerprint, server timestamp and uploader recorded. Files can be re-verified at any time. Every action goes into a **hash-chained, append-only audit log**. |
| 3 | **Move-out comparison** | Move-out inspection reuses the move-in items. Guided re-capture shows the move-in photo as a ghost overlay on the camera so the same shot can be lined up. Side-by-side + before/after slider + an SSIM "possible change" heatmap. |
| 4 | **Evidence-backed settlement** | Landlord proposes itemised deductions with a reason, linked to inspection items, with optional repair invoices. Tenant accepts or disputes each one. Refund calculated automatically. Both must confirm the final settlement. |
| 5 | **Two-party access** | Either party creates the tenancy and gets an expiring invite link for the other. Everything is authorised per tenancy: you only see tenancies you are part of. |
| 6 | **PDF report** | Generated in a background job: tenancy details, both inspections with photos, agreed/disputed status, deductions and responses, final settlement, file fingerprints and the audit log with chain verification. |

### Deliberately not in v1
Rent payments, property listings, AI chatbots, AI damage detection, blockchain, OCR, maintenance tickets, analytics. None of these strengthens the core workflow.

### Honest limits (said in the app, too)
- A hash proves a file **hasn't changed since upload**. It does not prove when or where a photo was taken.
- An SSIM difference is a **hint**, not proof of damage or responsibility. It only means much when the photos are taken from about the same position, which is why the guided overlay exists.
- The PDF is an organised record, **not a guaranteed legal document**.

## 4. Architecture

```
 React SPA ──REST /api/v1──► Express API ──Prisma──► PostgreSQL
                                │  │                     ▲
                                │  └── pg-boss queue ─────┘ (jobs live in Postgres)
                                │          │
                                │          └── worker: PDF generation (pdfkit)
                                ▼
                        Storage interface ── local disk now (uploads/)
                                             cloud bucket later (one file to swap)
```

- **Modular monolith**: one deployable Node app, organised by module (auth, leases, inspections, evidence, settlements, reports, audit).
- **Background jobs with pg-boss** instead of Redis + BullMQ: the queue lives in the Postgres we already run, so there's no extra infrastructure.
- **Storage behind an interface** (`put`, `get`, `remove`): local disk in development, swapped for a free bucket (Cloudinary / Supabase / R2) at deployment without touching business logic.

## 5. Data model

```
User ──< Lease >── Property ──< Room
          │  landlordId / tenantId (null until the invite is accepted)
          ├──< Invitation        (hashed token, role, expiry, single use)
          ├──< Inspection        (MOVE_IN | MOVE_OUT, unique per lease)
          │      └──< InspectionItem ──< Evidence (sha256, size, uploader, time)
          │             roomId, condition, notes, reviewStatus, version,
          │             baselineItemId (move-out item → its move-in item)
          ├── Settlement (1:1) ──< Deduction ──< Evidence (invoices)
          ├──< Report            (PENDING | READY | FAILED, file sha256)
          └──< AuditEvent        (prevHash, hash: per-lease hash chain)
```

### State machines

**Inspection:** `DRAFT → SUBMITTED → FINALIZED`
- Author edits in `DRAFT`, then submits (requires the other party to have joined).
- Reviewer marks each item `APPROVED` or `DISPUTED` (with a comment).
- Author revises disputed items; each revision bumps the item's `version` and resets it to `PENDING`.
- When every item is `APPROVED`, the inspection becomes `FINALIZED` and is read-only forever.

**Deduction:** `PROPOSED → ACCEPTED | DISPUTED`, and `DISPUTED → PROPOSED` (landlord revises) or `WITHDRAWN`.

**Settlement:** `OPEN → AGREED` once every deduction is accepted or withdrawn **and** both parties confirm. Any change to a deduction clears both confirmations.

## 6. Engineering problems and how they're solved

| Problem | Solution |
|---|---|
| Tenant and landlord edit/review the same item at once | **Optimistic locking**: every item/deduction has a `version`; updates are `UPDATE … WHERE id = ? AND version = ?`. A stale update returns **409** instead of silently overwriting. |
| Settlement half-saved, or deductions exceeding the deposit | Deductions and refund are computed inside a **PostgreSQL transaction**; the total is re-checked inside it. |
| Detect a swapped or edited photo | SHA-256 computed **on the server** while the upload streams in; `/evidence/:id/verify` re-hashes the stored file and compares. |
| Someone edits the history | **Hash-chained audit log**: `hash = SHA256(prevHash + event)`. Changing any old row breaks every hash after it, and `/audit/verify` finds the first broken link. |
| Two events written at the same moment fork the chain | Appending locks the lease row (`SELECT … FOR UPDATE`) inside the transaction, so events for one tenancy are written strictly one at a time. |
| One tenant reading another tenancy's records | Every lease-scoped route loads the lease and checks the user is its landlord or tenant. Non-members get **404**, not 403, so IDs can't be probed. |
| Duplicate submissions / invite reuse | Unique constraints (one inspection per type per lease, one settlement per lease); invites are single-use and expire. |
| PDF generation is slow | Done in a **background job** (pg-boss); the API returns `202 Accepted` and the UI polls the report status. |
| Large photo uploads | Streamed to disk with size/type limits (10 MB, JPEG/PNG/WebP); the hash is computed during the same pass. |

## 7. REST API (v1)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | Accounts and sessions |
| GET | `/auth/me` | Current user |
| GET · POST | `/leases` | My tenancies / create tenancy (property + rooms + my role) |
| GET | `/leases/:id` | Tenancy detail with parties, rooms, inspections, settlement summary |
| POST | `/leases/:id/invitations` | Create invite link for the other party |
| GET · POST | `/invitations/:token` · `/invitations/:token/accept` | Preview / accept an invite |
| POST | `/leases/:id/inspections` | Start the move-in or move-out inspection |
| GET | `/inspections/:id` | Inspection with rooms, items and evidence |
| PATCH | `/inspections/:id` | Meter readings (draft only) |
| PATCH | `/items/:id` | Condition / notes (needs `version`) |
| POST | `/items/:id/review` | Approve or dispute an item (needs `version`) |
| POST | `/inspections/:id/submit` | Submit for review |
| POST | `/items/:id/evidence` | Upload photos (multipart) |
| GET | `/evidence/:id/file` · `/evidence/:id/verify` | Download / re-verify a file |
| DELETE | `/evidence/:id` | Remove a photo (draft only) |
| GET | `/inspections/:id/comparison` | Move-in vs move-out pairs per item |
| GET · POST | `/leases/:id/settlement` | View / open the settlement |
| POST | `/settlements/:id/deductions` | Landlord proposes a deduction (+ invoices) |
| PATCH | `/deductions/:id` | Landlord revises or withdraws |
| POST | `/deductions/:id/respond` | Tenant accepts or disputes |
| POST | `/settlements/:id/confirm` | Party confirms the final settlement |
| GET · POST | `/leases/:id/reports` | List / request a PDF report (202) |
| GET | `/reports/:id/file` | Download PDF |
| GET | `/leases/:id/audit` | Audit log + chain verification |
| GET | `/health` | Liveness + DB check |
