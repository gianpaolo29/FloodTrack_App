import axios, { type AxiosError } from 'axios';
import { Platform } from 'react-native';
import type {
  AdminReport,
  AdminStats,
  AlertItem,
  ChangePasswordPayload,
  CheckInStatus,
  EvacuationCenter,
  FamilyGroup,
  FamilyMember,
  FieldReportData,
  Hazard,
  HazardPayload,
  Incident,
  IncidentDetail,
  IncidentMessage,
  LoginPayload,
  ProtocolItem,
  RegisterPayload,
  Report,
  ReportDetail,
  ReportSubmission,
  ResponderStats,
  ResponderStatus,
  ResponderUpdate,
  StatusUpdatePayload,
  TimelineEvent,
  UpdateProfilePayload,
  User,
  UserRole,
} from '@/types';
import * as Storage from '@/utils/storage';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.floodtrack.ph/api').replace(/\/$/, '');

interface RawUser {
  id: number;
  name: string;
  email: string;
  role: 'resident' | 'responder' | 'admin';
  contact_number: string | null;
  avatar_url: string | null;
  created_at: string;
  home_address?: string | null;
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
  user: { id: number; name: string; role: string } | null;
  created_at: string;
}

interface RawReport {
  id: number;
  reference_number: string;
  hazard_type: 'flood';
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
  ai_flagged?: boolean;
  ai_flag_reason?: string | null;
  ai_image_verified?: boolean | null;
  ai_image_notes?: string | null;
  potential_duplicate_of?: number | null;
}

interface RawAlert {
  id: number;
  title: string;
  body: string;
  type: 'advisory' | 'update' | 'critical';
  is_critical: boolean;
  read?: boolean;
  area?: string | null;
  address?: string | null;
  report_id?: number | null;
  expires_at: string | null;
  created_at: string;
}

const HAZARD_LABELS: Record<string, string> = {
  flood: 'Flood incident',
};

const HAZARD_TYPE_DISPLAY: Record<string, string> = {
  flood: 'Flood',
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
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
  const roleMap: Record<string, UserRole> = {
    resident: 'Resident',
    responder: 'Responder',
    admin: 'Responder',
  };
  return {
    id:          String(raw.id),
    firstName,
    lastName,
    email:       raw.email,
    contact:     raw.contact_number ?? '',
    role:        roleMap[raw.role] ?? 'Resident',
    joinedAt:    raw.created_at,
    avatarUrl:   raw.avatar_url ?? null,
    homeAddress: raw.home_address ?? null,
  };
}

function adaptReport(raw: RawReport): Report {
  return {
    id:           String(raw.id),
    reference:    raw.reference_number,
    title:        HAZARD_LABELS[raw.hazard_type] ?? 'Hazard report',
    type:         HAZARD_TYPE_DISPLAY[raw.hazard_type] ?? raw.hazard_type,
    severity:     raw.severity,
    status:       raw.status,
    address:      raw.address ?? '',
    latitude:     raw.latitude,
    longitude:    raw.longitude,
    reportedAt:   formatRelativeTime(raw.created_at),
    thumbnailUrl: raw.media?.[0]?.url,
    mediaCount:   raw.media?.length ?? 0,
  };
}

function adaptReportDetail(raw: RawReport): ReportDetail {
  const updates = raw.status_updates ?? [];

  // Use different timeline steps based on whether the report was rejected
  const isRejected = raw.status === 'rejected';
  const steps = isRejected
    ? [
        { status: 'pending',  label: 'Submitted' },
        { status: 'rejected', label: 'Rejected'  },
      ]
    : TIMELINE_STEPS;

  const timeline: TimelineEvent[] = steps.map(step => {
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
      author: `${u.user?.name ?? 'AI System'} (Responder)`,
      note:   u.notes!,
      time:   formatRelativeTime(u.created_at),
    }));

  return {
    ...adaptReport(raw),
    description:     raw.description ?? '',
    reportedBy:      raw.user?.name ?? 'Unknown',
    evidenceCount:   raw.media?.length ?? 0,
    mediaUrls:       raw.media?.map(m => m.url) ?? [],
    mediaItems:      raw.media?.map(m => ({ id: String(m.id), url: m.url, type: m.file_type })) ?? [],
    timeline,
    updates:         responderUpdates,
    aiFlagged:       raw.ai_flagged ?? false,
    aiFlagReason:    raw.ai_flag_reason ?? null,
    aiImageVerified: raw.ai_image_verified ?? null,
    aiImageNotes:    raw.ai_image_notes ?? null,
    aiHasDuplicate:  raw.potential_duplicate_of != null,
  };
}

export function adaptAlert(raw: RawAlert): AlertItem {
  const kindMap: Record<string, AlertItem['kind']> = {
    critical: 'critical',
    advisory: 'advisory',
    update:   'status_update',
  };
  return {
    id:       String(raw.id),
    kind:     kindMap[raw.type] ?? 'advisory',
    title:    raw.title,
    body:     raw.body,
    area:     raw.area || raw.address || '',
    time:      formatRelativeTime(raw.created_at),
    createdAt: raw.created_at,
    read:      raw.read ?? false,
    reportId:  raw.report_id ? String(raw.report_id) : undefined,
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
    distance:   '',
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

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: { Accept: 'application/json' },
});

client.interceptors.response.use(
  res => res,
  (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status ?? 0;
    const message = error.response?.data?.message ?? error.message;
    throw new ApiError(status, message);
  },
);

async function get<T>(path: string, token: string): Promise<T> {
  const res = await client.get<T>(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await client.post<T>(path, body, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.data;
}

async function put<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await client.put<T>(path, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
}

async function patch<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await client.patch<T>(path, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
}

async function formPost<T>(path: string, formData: FormData, token?: string): Promise<T> {
  const res = await client.post<T>(path, formData, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.data;
}

async function formPatch<T>(path: string, formData: FormData, token: string): Promise<T> {
  formData.append('_method', 'PATCH');
  const res = await client.post<T>(path, formData, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function del<T>(path: string, token: string, data?: unknown): Promise<T> {
  const res = await client.delete<T>(path, {
    headers: { Authorization: `Bearer ${token}` },
    ...(data ? { data } : {}),
  });
  return res.data;
}

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
    role:            'resident',
    contact_number:  payload.contact,
  });
  return { token: data.token, user: adaptUser(data.user) };
}

export async function apiLogout(token: string): Promise<void> {
  await post('/logout', {}, token).catch(() => {
  });
}

export async function apiCheckEmail(email: string): Promise<boolean> {
  try {
    const data = await post<{ exists: boolean }>('/check-email', { email });
    return data.exists;
  } catch {
    return false;
  }
}

export async function apiForgotPassword(email: string): Promise<void> {
  await post('/forgot-password', { email });
}

export async function apiResetPassword(
  email: string,
  token: string,
  password: string,
): Promise<void> {
  await post('/reset-password', { email, token, password });
}

export async function getMyReports(token: string): Promise<Report[]> {
  const data = await get<{ data: RawReport[] }>('/reports?my=1', token);
  return data.data.map(adaptReport);
}

export async function getAllReports(token: string): Promise<Report[]> {
  const data = await get<{ data: RawReport[] }>('/reports', token);
  return data.data.map(adaptReport);
}

export async function updateReport(
  id: string,
  payload: { severity?: string; description?: string },
  token: string,
): Promise<ReportDetail> {
  const raw = await put<RawReport>(`/reports/${id}`, payload, token);
  return adaptReportDetail(raw);
}

export async function deleteReportMedia(
  reportId: string,
  mediaId: string,
  token: string,
): Promise<void> {
  await del(`/reports/${reportId}/media/${mediaId}`, token);
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

export async function getAlerts(token: string): Promise<AlertItem[]> {
  const data = await get<RawAlert[]>('/alerts', token);
  return data.map(adaptAlert);
}

export async function markAlertRead(id: string, token: string): Promise<void> {
  await post(`/alerts/${id}/read`, {}, token);
}

export async function markAllAlertsRead(_alertIds: string[], token: string): Promise<void> {
  await post('/alerts/read-all', {}, token);
}

// ─── Personal (per-user) notifications ───────────────────────────────────────

interface RawUserNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  report_id: number | null;
  new_status: string | null;
  read_at: string | null;
  created_at: string;
}

function adaptUserNotification(raw: RawUserNotification): AlertItem {
  return {
    id:       `notif_${raw.id}`,
    kind:     'status_update',
    title:    raw.title,
    body:     raw.message,
    area:     '',
    time:      formatRelativeTime(raw.created_at),
    createdAt: raw.created_at,
    read:      raw.read_at !== null,
    reportId:  raw.report_id ? String(raw.report_id) : undefined,
  };
}

export async function getUserNotifications(token: string): Promise<AlertItem[]> {
  const data = await get<RawUserNotification[]>('/user/notifications', token);
  return data.map(adaptUserNotification);
}

export async function markUserNotificationRead(notifId: string, token: string): Promise<void> {
  const rawId = notifId.replace('notif_', '');
  await post(`/user/notifications/${rawId}/read`, {}, token);
}

export async function markAllUserNotificationsRead(token: string): Promise<void> {
  await post('/user/notifications/read-all', {}, token);
}

export async function getAlertsWithReadState(token: string): Promise<AlertItem[]> {
  const [broadcasts, personal] = await Promise.all([
    getAlerts(token),
    getUserNotifications(token),
  ]);
  // Merge and sort newest first by ISO date
  return [...personal, ...broadcasts].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function updateProfile(
  payload: UpdateProfilePayload,
  token: string,
): Promise<User> {
  const raw = await patch<RawUser>('/user/profile', payload, token);
  return adaptUser(raw);
}

export async function changePassword(
  payload: ChangePasswordPayload,
  token: string,
): Promise<void> {
  try {
    await put('/user/password', payload, token);
  } catch (e: any) {
    if (e?.status === 405) {
      await post('/user/password', payload, token);
    } else {
      throw e;
    }
  }
}

export async function uploadAvatar(
  uri: string,
  token: string,
): Promise<User> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const form = new FormData();
  form.append('avatar', {
    uri,
    name: `avatar.${ext}`,
    type: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  } as unknown as Blob);
  const raw = await formPost<RawUser>('/user/avatar', form, token);
  return adaptUser(raw);
}

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
  const path = `/responder/reports/${payload.incidentId}/status`;

  if (payload.media?.length) {
    const form = new FormData();
    form.append('status', payload.status);
    if (payload.notes) form.append('notes', payload.notes);

    payload.media.forEach((uri, i) => {
      const ext      = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ['mp4', 'mov'].includes(ext) ? `video/${ext}` : `image/${ext}`;
      form.append('media[]', {
        uri,
        name: `update_${i}.${ext}`,
        type: mimeType,
      } as unknown as Blob);
    });

    await formPatch(path, form, token);
  } else {
    await patch(path, {
      status: payload.status,
      notes:  payload.notes,
    }, token);
  }
}

export async function registerPushToken(pushToken: string, token: string): Promise<void> {
  await post('/device-tokens', { token: pushToken, platform: Platform.OS }, token);
}

export async function removePushToken(pushToken: string, token: string): Promise<void> {
  await del('/device-tokens', token, { token: pushToken });
}

export async function updateDutyStatus(isOnDuty: boolean, token: string): Promise<void> {
  await patch('/user/duty-status', { is_on_duty: isOnDuty }, token);
}

export async function getReportMessages(reportId: string, token: string): Promise<IncidentMessage[]> {
  const raw = await get<{ data: Array<{
    id: number;
    body: string;
    is_quick_reply: boolean;
    read_at: string | null;
    user: { id: number; name: string; role: string };
    created_at: string;
  }> }>(`/reports/${reportId}/messages`, token);
  const data = Array.isArray(raw) ? raw : raw.data;
  return data.map(m => ({
    id: String(m.id),
    reportId,
    userId: String(m.user.id),
    userName: m.user.name,
    userRole: m.user.role,
    body: m.body,
    isQuickReply: m.is_quick_reply,
    readAt: m.read_at,
    createdAt: formatRelativeTime(m.created_at),
  }));
}

export async function sendReportMessage(
  reportId: string,
  body: string,
  token: string,
  isQuickReply = false,
): Promise<void> {
  await post(`/reports/${reportId}/messages`, { body, is_quick_reply: isQuickReply }, token);
}

export const getIncidentMessages = getReportMessages;

export async function sendIncidentMessage(
  reportId: string,
  body: string,
  isQuickReply: boolean,
  token: string,
): Promise<void> {
  await sendReportMessage(reportId, body, token, isQuickReply);
}

export async function markMessagesRead(reportId: string, token: string): Promise<void> {
  await post(`/reports/${reportId}/messages/read`, {}, token);
}

export async function getUnreadCount(reportId: string, token: string): Promise<number> {
  const data = await get<{ unread_count: number }>(`/reports/${reportId}/messages/unread-count`, token);
  return data.unread_count;
}

export async function sendTypingEvent(reportId: string, token: string): Promise<void> {
  await post(`/reports/${reportId}/typing`, {}, token).catch(() => {});
}

export async function getTypingUsers(reportId: string, token: string): Promise<Array<{ id: number; name: string; role: string }>> {
  const data = await get<{ typing: Array<{ id: number; name: string; role: string }> }>(`/reports/${reportId}/typing`, token);
  return data.typing;
}

export async function getFieldReport(reportId: string, token: string): Promise<FieldReportData | null> {
  try {
    const raw = await get<{
      id: number;
      report_id: number;
      actions_taken: string;
      resources_used: string | null;
      people_assisted: number;
      damage_assessment: string | null;
      checklist: Record<string, boolean> | null;
    }>(`/responder/reports/${reportId}/field-report`, token);
    return {
      id: String(raw.id),
      reportId: String(raw.report_id),
      actionsTaken: raw.actions_taken,
      resourcesUsed: raw.resources_used ?? '',
      peopleAssisted: raw.people_assisted,
      damageAssessment: raw.damage_assessment ?? '',
      checklist: raw.checklist ?? {},
    };
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function saveFieldReport(
  reportId: string,
  data: Omit<FieldReportData, 'id' | 'reportId'>,
  token: string,
): Promise<void> {
  await post(`/responder/reports/${reportId}/field-report`, {
    actions_taken: data.actionsTaken,
    resources_used: data.resourcesUsed || null,
    people_assisted: data.peopleAssisted,
    damage_assessment: data.damageAssessment || null,
    checklist: data.checklist,
  }, token);
}

export async function getResponderStats(token: string): Promise<ResponderStats> {
  const raw = await get<{
    resolved_total: number;
    resolved_this_week: number;
    resolved_this_month: number;
    active_count: number;
    avg_response_minutes: number;
  }>('/responder/stats', token);
  return {
    resolvedTotal: raw.resolved_total,
    resolvedThisWeek: raw.resolved_this_week,
    resolvedThisMonth: raw.resolved_this_month,
    activeCount: raw.active_count,
    avgResponseMinutes: raw.avg_response_minutes,
  };
}

export interface WeatherData {
  current: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    description: string;
    icon: string;
    rainH: number;
    city: string;
  };
  alerts: Array<{ type: string; title: string; message: string }>;
  forecast: Array<{
    date: string;
    day: string;
    tempMin: number;
    tempMax: number;
    rainTotal: number;
    pop: number;
    description: string;
    icon: string;
  }>;
}

export async function getWeather(lat: number, lon: number, token: string): Promise<WeatherData> {
  const raw = await get<{
    current: Record<string, any>;
    alerts: Array<{ type: string; title: string; message: string }>;
    forecast: Array<Record<string, any>>;
  }>(`/weather?lat=${lat}&lon=${lon}`, token);

  return {
    current: {
      temperature: raw.current.temperature,
      humidity: raw.current.humidity,
      windSpeed: raw.current.wind_speed,
      description: raw.current.description,
      icon: raw.current.icon,
      rainH: raw.current.rain_1h,
      city: raw.current.city,
    },
    alerts: raw.alerts,
    forecast: (raw.forecast ?? []).map((f: any) => ({
      date: f.date,
      day: f.day,
      tempMin: f.temp_min,
      tempMax: f.temp_max,
      rainTotal: f.rain_total,
      pop: f.pop,
      description: f.description,
      icon: f.icon,
    })),
  };
}

export async function withdrawReport(id: string, token: string): Promise<void> {
  await del('/reports/' + id, token);
}

interface RawFamilyMember {
  id: number;
  name: string;
  email: string;
  check_in_status: 'safe' | 'need_help' | 'unknown';
  checked_in_at: string | null;
  is_creator: boolean;
  latitude: number | null;
  longitude: number | null;
}

interface RawFamilyGroup {
  id: number;
  name: string;
  invite_code: string;
  members: RawFamilyMember[];
  created_at: string;
}

function adaptFamilyMember(raw: RawFamilyMember): FamilyMember {
  const parts     = raw.name.trim().split(' ');
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '';
  return {
    id:            String(raw.id),
    firstName,
    lastName,
    email:         raw.email,
    checkInStatus: raw.check_in_status,
    checkedInAt:   raw.checked_in_at,
    isCreator:     raw.is_creator,
    latitude:      raw.latitude ?? null,
    longitude:     raw.longitude ?? null,
  };
}

function adaptFamilyGroup(raw: RawFamilyGroup): FamilyGroup {
  return {
    id:         String(raw.id),
    name:       raw.name,
    inviteCode: raw.invite_code,
    members:    raw.members.map(adaptFamilyMember),
    createdAt:  raw.created_at,
  };
}

export async function getFamily(token: string): Promise<FamilyGroup | null> {
  try {
    const raw = await get<RawFamilyGroup>('/family', token);
    return adaptFamilyGroup(raw);
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function createFamily(name: string, token: string): Promise<FamilyGroup> {
  const raw = await post<RawFamilyGroup>('/family', { name }, token);
  return adaptFamilyGroup(raw);
}

export async function inviteFamilyMember(email: string, token: string): Promise<void> {
  await post('/family/invite', { email }, token);
}

export async function joinFamily(code: string, token: string): Promise<FamilyGroup> {
  const raw = await post<RawFamilyGroup>(`/family/join/${code}`, {}, token);
  return adaptFamilyGroup(raw);
}

export async function familyCheckIn(
  status: CheckInStatus,
  token: string,
  location?: { latitude: number; longitude: number },
): Promise<void> {
  await post('/family/check-in', {
    status,
    latitude: location?.latitude,
    longitude: location?.longitude,
  }, token);
}

export async function leaveFamily(token: string): Promise<void> {
  await del('/family/leave', token);
}

export async function removeFamilyMember(memberId: string, token: string): Promise<void> {
  await del(`/family/members/${memberId}`, token);
}

export async function getEvacuationCenters(token: string): Promise<EvacuationCenter[]> {
  const data = await get<Array<{
    id: number;
    name: string;
    address: string;
    type: string;
    capacity: number;
    latitude: number;
    longitude: number;
  }>>('/evacuation-centers', token);
  return data.map(c => ({
    id:        String(c.id),
    name:      c.name,
    address:   c.address,
    type:      c.type,
    capacity:  c.capacity,
    latitude:  c.latitude,
    longitude: c.longitude,
  }));
}

export async function getProtocols(token: string): Promise<ProtocolItem[]> {
  const data = await get<Array<{
    id: string;
    hazard: string;
    icon: string;
    color: string;
    safety_tip: string;
    steps: string[];
  }>>('/protocols', token);
  return data.map(p => ({
    id:        p.id,
    hazard:    p.hazard,
    icon:      p.icon,
    color:     p.color,
    safetyTip: p.safety_tip,
    steps:     p.steps,
  }));
}

export async function getAdminStats(token: string): Promise<AdminStats> {
  return get<AdminStats>('/admin/stats', token);
}

function adaptAdminReport(raw: RawReport): AdminReport {
  return {
    ...adaptReport(raw),
    description:     raw.description ?? '',
    aiImageVerified: raw.ai_image_verified ?? null,
    aiFlagged:       raw.ai_flagged ?? false,
    aiFlagReason:    raw.ai_flag_reason ?? null,
    aiHasDuplicate:  raw.potential_duplicate_of != null,
    aiImageNotes:    raw.ai_image_notes ?? null,
    reportedByName:  raw.user?.name ?? 'Unknown',
  };
}

export async function getAdminReports(token: string): Promise<AdminReport[]> {
  const data = await get<{ data: RawReport[] }>('/reports', token);
  return data.data.map(adaptAdminReport);
}

export async function updateAdminReportStatus(
  id: string,
  status: 'verified' | 'rejected',
  token: string,
): Promise<void> {
  const path = status === 'verified'
    ? `/reports/${id}/verify`
    : `/reports/${id}/reject`;
  await patch<unknown>(path, {}, token);
}

/* ── Hazard Management (Admin) ─────────────────────── */

interface RawHazard {
  id: number;
  category: 'flood' | 'road';
  type: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function adaptHazard(raw: RawHazard): Hazard {
  return {
    id:          String(raw.id),
    category:    raw.category,
    type:        raw.type,
    severity:    raw.severity,
    title:       raw.title,
    description: raw.description ?? '',
    latitude:    raw.latitude,
    longitude:   raw.longitude,
    address:     raw.address ?? '',
    active:      raw.active,
    createdAt:   formatRelativeTime(raw.created_at),
    updatedAt:   formatRelativeTime(raw.updated_at),
  };
}

export async function getHazards(token: string): Promise<Hazard[]> {
  const data = await get<{ data: RawHazard[] }>('/admin/hazards', token);
  return (Array.isArray(data) ? data : data.data).map(adaptHazard);
}

export async function getActiveHazards(token: string): Promise<Hazard[]> {
  const data = await get<{ data: RawHazard[] }>('/hazards', token);
  return (Array.isArray(data) ? data : data.data).map(adaptHazard);
}

export async function createHazard(payload: HazardPayload, token: string): Promise<Hazard> {
  const raw = await post<RawHazard>('/admin/hazards', payload, token);
  return adaptHazard(raw);
}

export async function updateHazard(id: string, payload: Partial<HazardPayload> & { active?: boolean }, token: string): Promise<Hazard> {
  const raw = await put<RawHazard>(`/admin/hazards/${id}`, payload, token);
  return adaptHazard(raw);
}

export async function deleteHazard(id: string, token: string): Promise<void> {
  await del(`/admin/hazards/${id}`, token);
}

export async function getCurrentUser(token: string): Promise<User & { isOnDuty?: boolean }> {
  const raw = await get<RawUser & { is_on_duty?: boolean }>('/me', token);
  return {
    ...adaptUser(raw),
    isOnDuty: raw.is_on_duty ?? false,
  };
}
