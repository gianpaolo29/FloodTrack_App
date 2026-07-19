export type Severity       = 'low' | 'moderate' | 'high' | 'critical';
export type ReportStatus   = 'pending' | 'verified' | 'assigned' | 'resolved' | 'rejected';
export type ResponderStatus = 'pending' | 'en_route' | 'on_scene' | 'resolved';
export type UserRole       = 'Resident' | 'Responder';
export type AlertKind      = 'critical' | 'advisory' | 'status_update';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  contact: string;
  role: UserRole;
  joinedAt: string;
  avatarUrl?: string | null;
  homeAddress?: string | null;
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

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
}

export interface ReportDetail extends Report {
  description: string;
  reportedBy: string;
  timeline: TimelineEvent[];
  updates: ResponderUpdate[];
  evidenceCount: number;
  mediaUrls: string[];
  mediaItems: MediaItem[];
  aiFlagged: boolean;
  aiFlagReason: string | null;
  aiImageVerified: boolean | null;
  aiImageNotes: string | null;
  aiHasDuplicate: boolean;
}

export interface AdminReport extends Report {
  description: string;
  aiImageVerified: boolean | null;
  aiFlagged: boolean;
  aiFlagReason: string | null;
  aiHasDuplicate: boolean;
  aiImageNotes: string | null;
  reportedByName: string;
}

export interface ReportSubmission {
  latitude: number;
  longitude: number;
  address: string;
  hazardType: string;
  severity: Severity;
  description: string;
  photos?: string[];
}

export interface AlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  area: string;
  time: string;
  createdAt: string;
  read: boolean;
  reportId?: string;
}

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
  media?: string[];
}

export interface IncidentMessage {
  id: string;
  reportId: string;
  userId: string;
  userName: string;
  userRole: string;
  body: string;
  isQuickReply: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface FieldReportData {
  id?: string;
  reportId: string;
  actionsTaken: string;
  resourcesUsed: string;
  peopleAssisted: number;
  damageAssessment: string;
  checklist: Record<string, boolean>;
}

export interface ResponderStats {
  resolvedTotal: number;
  resolvedThisWeek: number;
  resolvedThisMonth: number;
  activeCount: number;
  avgResponseMinutes: number;
}

export type CheckInStatus = 'safe' | 'need_help' | 'unknown';

export interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  checkInStatus: CheckInStatus;
  checkedInAt: string | null;
  isCreator: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface FamilyGroup {
  id: string;
  name: string;
  inviteCode: string;
  members: FamilyMember[];
  createdAt: string;
}

export interface EvacuationCenter {
  id: string;
  name: string;
  address: string;
  type: string;
  capacity: number;
  latitude: number;
  longitude: number;
}

export interface ProtocolItem {
  id: string;
  hazard: string;
  icon: string;
  color: string;
  safetyTip: string;
  steps: string[];
}

export interface AdminStats {
  stats: {
    total_reports: number;
    pending: number;
    active: number;
    resolved_today: number;
    total_users: number;
    total_responders: number;
    active_alerts: number;
  };
  trends: {
    reports: number;
    resolved: number;
  };
  severity_breakdown: Record<string, number>;
  status_breakdown: Record<string, number>;
  recent_reports: Array<{
    id: number;
    reference_number: string;
    hazard_type: string;
    severity: string;
    status: string;
    address: string;
    created_at: string;
    user?: { id: number; name: string };
    ai_flagged?: boolean;
    ai_flag_reason?: string | null;
    ai_image_verified?: boolean | null;
    ai_image_notes?: string | null;
    potential_duplicate_of?: number | null;
  }>;
}

export type HazardCategoryType = 'flood' | 'road';

export interface Hazard {
  id: string;
  category: HazardCategoryType;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HazardPayload {
  category: HazardCategoryType;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string;
}
