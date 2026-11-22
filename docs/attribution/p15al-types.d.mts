export type Access = 'YES' | 'NO' | 'UNKNOWN';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export type Reason =
  | 'conflicting-captures'
  | 'source-withdrawn'
  | 'licence-changed'
  | 'tier-changed'
  | 'content-changed'
  | 'source-unavailable'
  | 'review-overdue'
  | 'review-due';

export interface Provenance {
  source: string;
  licence: string;
  retrievedOn: string;
  verificationTier: number | 'UNKNOWN';
}

export interface Source extends Provenance {
  contentDigest: string | null;
  validForDays: number;
}

export interface RecordLink {
  recordId: string;
  access: Access;
  sourceIds: string[];
  dependsOn: string[];
}

interface CaptureReference {
  captureId: string;
  sourceId: string;
  checkedOn: string;
  baselineHash: string;
  evidenceDigest: string;
}

export type Retrieval = CaptureReference & {
  kind: 'retrieved';
  licence: string;
  verificationTier: number | 'UNKNOWN';
  retrievedOn: string;
  contentDigest: string;
};

export type Capture = Retrieval | (CaptureReference & {
  kind: 'unavailable' | 'withdrawn';
});

export interface ReviewInput {
  schema: 'access-maps/source-revalidation-input/1';
  asOf: string;
  leadDays: number;
  sources: Source[];
  records: RecordLink[];
  captures: Capture[];
}

export interface Calendar {
  lastRetrievedOn: string;
  dueInDays: number;
  state: 'current' | 'due' | 'overdue';
}

export interface SourceReview {
  provenance: Provenance;
  baselineHash: string;
  calendar: Calendar;
  reasons: Reason[];
  latestCheckOn: string | null;
  latestRetrieval: Retrieval | null;
  agreement: 'no-retrieval' | 'matches' | 'metadata-only' | 'different' | 'ambiguous';
  currentCaptures: number;
  supersededCaptures: number;
  supportingCaptureIds: string[];
  directRecordIds: string[];
  dependentRecordIds: string[];
}

export interface RecordImpact {
  recordId: string;
  access: Access;
  sources: Provenance[];
  directSourceIds: string[];
  flaggedSourceIds: string[];
}

export interface ReviewReport {
  schema: 'access-maps/source-revalidation-report/1';
  input: ReviewInput;
  sourceReviews: SourceReview[];
  records: RecordImpact[];
  digest: string;
}

export interface QueueCandidate {
  proposalId: string;
  sourceId: string;
  recordIds: string[];
  priority: Priority;
  reason: Reason;
  provenance: Provenance;
}
