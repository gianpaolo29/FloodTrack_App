/**
 * API service layer — FloodTrack
 *
 * All functions are async and return the typed shapes defined in @/types.
 * Laravel API responses are adapted here; screens never touch raw API shapes.
 *
 * Base URL: set EXPO_PUBLIC_API_URL in .env
 *   Local dev:   EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api
 *   Production:  EXPO_PUBLIC_API_URL=https://your-forge-domain.com/api
 */
import type {
  AlertItem,
  Incident,
  IncidentDetail,
  LoginPayload,
  RegisterPayload,
  Report,
  ReportDetail,
  ReportSubmission,
  ResponderStatus,
  ResponderUpdate,
  StatusUpdatePayload,
  TimelineEvent,
  User,
  UserRole,
} from '@/types';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.floodtrack.ph/api').replace(/\/$/, '');

// ─── Raw Laravel shapes ───────────────────────────────────────────────────────
// These live only in this file — screens always receive the adapted types.

interface RawUser {
  id: number;
  name: string;
  email: string;
  role: 'resident' | 'responder' | 'admin';
  contact_number: string | null;
  created_at: string;
}

interface RawMedia {
  id: number;
  file_path: string;
  file_type: 'image' | 'video';
  url: string;
}

interface RawStatusUpdate {
  id: number;
  status: string;
  notes: string | null;
  user: { id: number; name: string; role: string };
  created_at: string;
}

interface RawReport {
  id: number;
  reference_number: string;
  hazard_type: 'flood' | 'road_damage' | 'debris' | 'drainage' | 'other';
  severity: 'low' | 'moderate' | 'high' | 'critical';
  status: 'pending' | 'verified' | 'assigned' | 'resolved' | 'rejected';
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  user?: { id: number; name: string; contact_number?: string | null };
  assigned_responder?: { id: number; name: string; contact_number: string | null } | null;
  media?: RawMedia[];
  status_updates?: RawStatusUpdate[];
  created_at: string;
}

interface RawAlert {
  id: number;
  title: string;
  body: string;
  type: 'advisory' | 'update' | 'critical';
  is_critical: boolean;
  expires_at: string | null;
  created_at: string;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

const HAZARD_LABELS: Record<string, string> = {
  flood:       'Flood incident',
  road_damage: 'Road damage',
  debris:      'Debris on road',
  drainage:    'Drainage issue',
  other:       'Hazard report',
};

const HAZARD_TYPE_DISPLAY: Record<string, string> = {
  flood:       'Flood',
  road_damage: 'Road damage',
  debris:      'Debris',
  drainage:    'Drainage',
  other:       'Other',
};

const TIMELINE_STEPS: Array<{ status: string; label: string }> = [
  { status: 'pending',  label: 'Submitted'         },
  { status: 'verified', label: 'Verified'           },
  { status: 'assigned', label: 'Responder assigned' },
  { status: 'resolved', label: 'Resolved'           },
];

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now  = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  const month = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${month}, ${time}`;
}

function adaptUser(raw: RawUser): User {
  const parts     = raw.name.trim().split(' ');
  const firstName = parts[0] ?? '';
  const lastName  = parts.slice(1).join(' ') || '';
  const roleMap: Record<string, UserRole> = {
    resident: 'Resident',
    responder: 'Responder',
    admin: 'Responder', // admin uses responder UI on mobile
  };
  return {
    id:        String(raw.id),
    firstName,
    lastName,
    email:     raw.email,
    contact:   raw.contact_number ?? '',
    role:      roleMap[raw.role] ?? 'Resident',
    joinedAt:  raw.created_at,
  };
}

function adaptReport(raw: RawReport): Report {
  return {
    id:         String(raw.id),
    reference:  raw.reference_number,
    title:      HAZARD_LABELS[raw.hazard_type] ?? 'Hazard report',
    type:       HAZARD_TYPE_DISPLAY[raw.hazard_type] ?? raw.hazard_type,
    severity:   raw.severity,
    status:     raw.status,
    address:    raw.address ?? '',
    latitude:   raw.latitude,
    longitude:  raw.longitude,
    reportedAt: formatRelativeTime(raw.created_at),
  };
}

function adaptReportDetail(raw: RawReport): ReportDetail {
  const updates = raw.status_updates ?? [];

  const timeline: TimelineEvent[] = TIMELINE_STEPS.map(step => {
    const match = updates.find(u => u.status === step.status);
    return {
      status: step.status as ReportDetail['status'],
      label:  step.label,
      detail: match?.notes ?? '',
      time:   match ? formatRelativeTime(match.created_at) : '',
      done:   !!match,
    };
  });

  const responderUpdates: ResponderUpdate[] = updates
    .filter(u => ['en_route', 'on_scene'].includes(u.status) && u.notes)
    .map(u => ({
      author: `${u.user.name} (Responder)`,
      note:   u.notes!,
      time:   formatRelativeTime(u.created_at),
    }));

  return {
    ...adaptReport(raw),
    description:   raw.description ?? '',
    reportedBy:    raw.user?.name ?? 'Unknown',
    evidenceCount: raw.media?.length ?? 0,
    timeline,
    updates: responderUpdates,
  };
}

function adaptAlert(raw: RawAlert): AlertItem {
  const kindMap: Record<string, AlertItem['kind']> = {
    critical: 'critical',
    advisory: 'advisory',
    update:   'status_update',
  };
  return {
    id:   String(raw.id),
    kind: kindMap[raw.type] ?? 'advisory',
    title: raw.title,
    body:  raw.body,
    area:  '',
    time:  formatRelativeTime(raw.created_at),
    read:  false,
  };
}

function adaptIncident(raw: RawReport): Incident {
  const lastUpdate = (raw.status_updates ?? []).findLast(
    u => ['en_route', 'on_scene', 'pending'].includes(u.status),
  );
  const responderStatus: ResponderStatus =
    lastUpdate?.status === 'en_route' ? 'en_route'
    : lastUpdate?.status === 'on_scene' ? 'on_scene'
    : 'pending';

  return {
    ...adaptReport(raw),
    reportStatus:    raw.status,
    responderStatus,
    distance:   '',    // calculated on-device if needed
    nearbyCount: 0,
  };
}

function adaptIncidentDetail(raw: RawReport): IncidentDetail {
  return {
    ...adaptIncident(raw),
    description:   raw.description ?? '',
    reportedBy:    raw.user?.name ?? 'Unknown',
    contactNumber: raw.user?.contact_number ?? '',
    evidenceCount: raw.media?.length ?? 0,
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `GET ${path} → ${res.status}`);
  }
  return res.json();
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.message ?? `POST ${path} → ${res.status}`);
  }
  return res.json();
}

async function patch<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.message ?? `PATCH ${path} → ${res.status}`);
  }
  return res.json();
}

/** Multipart POST — used for report submission with photo/video attachments */
async function formPost<T>(path: string, formData: FormData, token?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Do NOT set Content-Type — fetch sets it with boundary automatically
    },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.message ?? `POST ${path} → ${res.status}`);
  }
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function apiLogin(
  payload: LoginPayload,
): Promise<{ token: string; user: User }> {
  const data = await post<{ token: string; user: RawUser }>('/login', {
    email:    payload.email,
    password: payload.password,
  });
  return { token: data.token, user: adaptUser(data.user) };
}

export async function apiRegister(
  payload: RegisterPayload,
): Promise<{ token: string; user: User }> {
  const data = await post<{ token: string; user: RawUser }>('/register', {
    name:            `${payload.firstName} ${payload.lastName}`.trim(),
    email:           payload.email,
    password:        payload.password,
    password_confirmation: payload.password,
    role:            payload.role.toLowerCase(),
    contact_number:  payload.contact,
  });
  return { token: data.token, user: adaptUser(data.user) };
}

export async function apiLogout(token: string): Promise<void> {
  await post('/logout', {}, token).catch(() => {
    // Swallow network errors — local session is cleared regardless
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getMyReports(token: string): Promise<Report[]> {
  const data = await get<{ data: RawReport[] }>('/reports?my=1', token);
  return data.data.map(adaptReport);
}

/** Fetches all active reports for the map (pins + heatmap). */
export async function getAllReports(token: string): Promise<Report[]> {
  const data = await get<{ data: RawReport[] }>('/reports', token);
  return data.data.map(adaptReport);
}

export async function getReportDetail(id: string, token: string): Promise<ReportDetail> {
  const raw = await get<RawReport>(`/reports/${id}`, token);
  return adaptReportDetail(raw);
}

export async function submitReport(
  payload: ReportSubmission,
  token: string,
): Promise<{ reference: string }> {
  const form = new FormData();
  form.append('hazard_type',  payload.hazardType);
  form.append('severity',     payload.severity);
  form.append('latitude',     String(payload.latitude));
  form.append('longitude',    String(payload.longitude));
  form.append('address',      payload.address);
  form.append('description',  payload.description);

  payload.photos?.forEach((uri, i) => {
    const ext      = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ['mp4', 'mov'].includes(ext) ? `video/${ext}` : `image/${ext}`;
    form.append('media[]', {
      uri,
      name: `photo_${i}.${ext}`,
      type: mimeType,
    } as unknown as Blob);
  });

  const raw = await formPost<RawReport>('/reports', form, token);
  return { reference: raw.reference_number };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlerts(token: string): Promise<AlertItem[]> {
  const data = await get<RawAlert[]>('/alerts', token);
  return data.map(adaptAlert);
}

/** Read-state is managed client-side — the API has no per-user read tracking. */
export async function markAlertRead(_id: string, _token: string): Promise<void> {}

export async function markAllAlertsRead(_token: string): Promise<void> {}

// ─── Responder ────────────────────────────────────────────────────────────────

export async function getAssignedIncidents(token: string): Promise<Incident[]> {
  const data = await get<{ data: RawReport[] }>('/reports?assigned=me', token);
  return data.data.map(adaptIncident);
}

export async function getIncidentDetail(id: string, token: string): Promise<IncidentDetail> {
  const raw = await get<RawReport>(`/reports/${id}`, token);
  return adaptIncidentDetail(raw);
}

export async function updateIncidentStatus(
  payload: StatusUpdatePayload,
  token: string,
): Promise<void> {
  await patch(`/reports/${payload.incidentId}/status`, {
    status: payload.status,
    notes:  payload.notes,
  }, token);
}
