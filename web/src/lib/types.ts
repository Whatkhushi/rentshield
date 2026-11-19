export type Role = 'LANDLORD' | 'TENANT';
export type Stage = 'WAITING_FOR_PARTY' | 'MOVE_IN' | 'LIVING' | 'MOVE_OUT' | 'SETTLEMENT' | 'SETTLED';
export type InspectionType = 'MOVE_IN' | 'MOVE_OUT';
export type InspectionStatus = 'DRAFT' | 'SUBMITTED' | 'FINALIZED';
export type Condition = 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING' | 'NOT_APPLICABLE';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'DISPUTED';
export type DeductionStatus = 'PROPOSED' | 'ACCEPTED' | 'DISPUTED' | 'WITHDRAWN';

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Party {
  id: number;
  name: string;
  email: string;
}

export interface Room {
  id: number;
  name: string;
  sortOrder: number;
}

export interface Property {
  id: number;
  addressLine: string;
  city: string;
  propertyType: 'APARTMENT' | 'INDEPENDENT_HOUSE' | 'ROOM' | 'PG';
  rooms?: Room[];
}

export interface InspectionSummary {
  id: number;
  type: InspectionType;
  status: InspectionStatus;
  authorId: number;
  itemCount?: number;
  documented?: number;
  approved?: number;
  disputed?: number;
  submittedAt?: string | null;
  finalizedAt?: string | null;
}

export interface LeaseSummary {
  id: number;
  property: Property;
  landlord: Party | null;
  tenant: Party | null;
  startDate: string;
  monthlyRent: number;
  securityDeposit: number;
  status: string;
  myRole: Role;
  stage: Stage;
  inspections: InspectionSummary[];
  settlement: { status: 'OPEN' | 'AGREED'; finalRefund: number | null } | null;
}

export interface LeaseDetail extends LeaseSummary {
  invitations: { id: number; role: Role; expiresAt: string }[];
}

export interface Evidence {
  id: number;
  kind: 'PHOTO' | 'INVOICE';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
  uploadedById: number;
}

export interface Item {
  id: number;
  roomId: number;
  name: string;
  condition: Condition | null;
  notes: string | null;
  reviewStatus: ReviewStatus;
  reviewComment: string | null;
  version: number;
  evidence: Evidence[];
  baselineItem: (Omit<Item, 'baselineItem'> & { evidence: Evidence[] }) | null;
}

export interface Inspection {
  id: number;
  leaseId: number;
  type: InspectionType;
  status: InspectionStatus;
  authorId: number;
  electricityReading: string | null;
  waterReading: string | null;
  gasReading: string | null;
  generalNotes: string | null;
  submittedAt: string | null;
  finalizedAt: string | null;
  items: Item[];
  rooms: Room[];
  myRole: Role;
  isAuthor: boolean;
  otherPartyJoined: boolean;
}

export interface Deduction {
  id: number;
  reason: string;
  amount: number;
  status: DeductionStatus;
  tenantComment: string | null;
  version: number;
  evidence: Evidence[];
  item: {
    id: number;
    name: string;
    condition: Condition | null;
    room: { name: string };
    evidence: Pick<Evidence, 'id' | 'sha256' | 'mimeType'>[];
    baselineItem: { id: number; condition: Condition | null; evidence: Pick<Evidence, 'id' | 'sha256' | 'mimeType'>[] } | null;
  } | null;
}

export interface Settlement {
  id: number;
  depositAmount: number;
  status: 'OPEN' | 'AGREED';
  landlordConfirmedAt: string | null;
  tenantConfirmedAt: string | null;
  agreedAt: string | null;
  finalRefund: number | null;
  deductions: Deduction[];
  totals: {
    deposit: number;
    accepted: number;
    open: number;
    proposedTotal: number;
    refundIfAllAccepted: number;
    refundSoFar: number;
    unresolvedCount: number;
  };
}

export interface AuditEvent {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  data: Record<string, unknown> | null;
  prevHash: string;
  hash: string;
  createdAt: string;
  actor: { id: number; name: string } | null;
}

export interface Report {
  id: number;
  status: 'PENDING' | 'READY' | 'FAILED';
  sha256: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
