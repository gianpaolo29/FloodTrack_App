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
  role?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  contact_number?: string;
}

export interface ChangePasswordPayload {
  current_password: string;
  password: string;
  password_confirmation: string;
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
  thumbnailUrl?: string;
  mediaCount: number;
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
  media?: string[];   // local file URIs from camera / gallery
}

// ─── Incident messages (chat) ────────────────────────────────────────────────

export interface IncidentMessage {
  id: string;
  reportId: string;
  userId: string;
  userName: string;
  userRole: string;
  body: string;
  isQuickReply: boolean;
  createdAt: string;
}

// ─── Field report ────────────────────────────────────────────────────────────

export interface FieldReportData {
  id?: string;
  reportId: string;
  actionsTaken: string;
  resourcesUsed: string;
  peopleAssisted: number;
  damageAssessment: string;
  checklist: Record<string, boolean>;
}

// ─── Responder stats ─────────────────────────────────────────────────────────

export interface ResponderStats {
  resolvedTotal: number;
  resolvedThisWeek: number;
  resolvedThisMonth: number;
  activeCount: number;
  avgResponseMinutes: number;
}
