// ─── Shared domain types ──────────────────────────────────────────────────────
// Single source of truth — import from here, never redefine per-screen.

export type Severity       = 'low' | 'moderate' | 'high' | 'critical';
export type ReportStatus   = 'pending' | 'verified' | 'assigned' | 'resolved' | 'rejected';
export type ResponderStatus = 'pending' | 'en_route' | 'on_scene' | 'resolved';
export type UserRole       = 'Resident' | 'Responder';
export type AlertKind      = 'critical' | 'advisory' | 'status_update';

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  role: UserRole;
  joinedAt: string;       // ISO date string
}

// ─── Auth payloads ────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  password: string;
  role: UserRole;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface Report {
  id: string;
  reference: string;
  title: string;
  type: string;
  severity: Severity;
  status: ReportStatus;
  address: string;
  latitude: number;
  longitude: number;
  reportedAt: string;
  thumbnailUrl?: string;   // first media URL from list response, if included
  mediaCount?: number;     // total number of photos attached
}

export interface TimelineEvent {
  status: ReportStatus;
  label: string;
  detail: string;
  time: string;
  done: boolean;
}

export interface ResponderUpdate {
  author: string;
  note: string;
  time: string;
}

export interface ReportDetail extends Report {
  description: string;
  reportedBy: string;
  timeline: TimelineEvent[];
  updates: ResponderUpdate[];
  evidenceCount: number;
  mediaUrls: string[];
}

export interface ReportSubmission {
  latitude: number;
  longitude: number;
  address: string;
  hazardType: string;
  severity: Severity;
  description: string;
  photos?: string[];   // local file URIs from camera / gallery
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  area: string;
  time: string;
  read: boolean;
  reportId?: string;       // if kind === 'status_update', links to report detail
}

// ─── Responder incidents ──────────────────────────────────────────────────────

export interface Incident {
  id: string;
  reference: string;
  title: string;
  type: string;
  severity: Severity;
  reportStatus: ReportStatus;
  responderStatus: ResponderStatus;
  address: string;
  latitude: number;
  longitude: number;
  distance: string;
  nearbyCount: number;
  reportedAt: string;
}

export interface IncidentDetail extends Incident {
  description: string;
  reportedBy: string;
  contactNumber: string;
  evidenceCount: number;
}

export interface StatusUpdatePayload {
  incidentId: string;
  status: ResponderStatus;
  notes?: string;
}
