import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlertBadge } from '@/context/AlertBadgeContext';
import {
  getAlertsWithReadState,
  markAlertRead,
  markAllAlertsRead,
  markUserNotificationRead,
  markAllUserNotificationsRead,
  adaptAlert,
} from '@/services/api';
import { socketService } from '@/services/socket';
import { getNotificationPrefs } from '@/services/notifications';
import type { AlertItem } from '@/types';

/* ─── Helpers ─── */
function dateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Other';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const alertDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (alertDay.getTime() === today.getTime()) return 'Today';
  if (alertDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function formatAlertTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

const KIND_META: Record<string, { icon: IoniconsName; bg: string; color: string; source: string }> = {
  critical:       { icon: 'warning',            bg: '#EF444422', color: '#EF4444', source: 'Dispatch' },
  rejected:       { icon: 'close-circle',       bg: '#EF444422', color: '#EF4444', source: 'FloodTrack' },
  status_update:  { icon: 'shield-checkmark',   bg: '#10B98122', color: '#10B981', source: 'FloodTrack' },
  advisory:       { icon: 'rainy',              bg: '#F59E0B22', color: '#F59E0B', source: 'PAGASA via FloodTrack' },
  welcome:        { icon: 'heart-circle',       bg: colors.brand[500] + '22', color: colors.brand[500], source: 'FloodTrack' },
  new_assignment: { icon: 'radio',              bg: colors.brand[500] + '22', color: colors.brand[500], source: 'Dispatch' },
  new_message:    { icon: 'chatbubble-ellipses',bg: '#7C3AED22', color: '#7C3AED', source: 'FloodTrack' },
};

/* ─── Alert Row ─── */
function AlertRow({
  alert,
  isDark,
  textPrimary,
  textSecondary,
  onPress,
}: {
  alert: AlertItem;
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}) {
  const meta = KIND_META[alert.kind] ?? KIND_META.advisory;
  const time = formatAlertTime(alert.createdAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        $.alertRow,
        pressed && { opacity: 0.85 },
      ]}
    >
      {/* Icon */}
      <View style={[$.alertIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text style={[$.alertTitle, { color: textPrimary, fontWeight: alert.read ? '600' : '700' }]} numberOfLines={2}>
          {alert.title}
        </Text>
        {!!alert.body && (
          <Text style={[$.alertBody, { color: textSecondary }]} numberOfLines={3}>
            {alert.body}
          </Text>
        )}
        <Text style={[$.alertSource, { color: textSecondary }]}>
          {meta.source} · {time}
        </Text>
      </View>

      {/* Unread dot */}
      {!alert.read && <View style={$.unreadDot} />}
    </Pressable>
  );
}

/* ─── Alert Detail ─── */
function AlertDetail({
  alert,
  isDark,
  screenBg,
  bottomInset,
  onBack,
  onViewIncident,
}: {
  alert: AlertItem;
  isDark: boolean;
  screenBg: string;
  bottomInset: number;
  onBack: () => void;
  onViewIncident?: () => void;
}) {
  const meta = KIND_META[alert.kind] ?? KIND_META.advisory;
  const time = formatAlertTime(alert.createdAt);
  const cardBg = isDark ? colors.dark.card : colors.white;
  const cardBorder = isDark ? colors.dark.border : 'rgba(0,0,0,0.06)';
  const textPrimary = isDark ? colors.dark.text : colors.slate[900];
  const textSecondary = isDark ? colors.dark.subtext : colors.slate[500];

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={d.backRowFixed}>
        <Pressable onPress={onBack} style={d.backRow}>
          <Ionicons name="chevron-back" size={20} color={textPrimary} />
          <Text style={[d.backLabel, { color: textPrimary }]}>Alerts</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[d.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Icon + meta */}
          <View style={d.header}>
            <View style={[$.alertIcon, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon} size={22} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[d.title, { color: textPrimary }]}>{alert.title}</Text>
              <Text style={[$.alertSource, { color: textSecondary }]}>{meta.source} · {time}</Text>
            </View>
          </View>

          {/* Body */}
          <Text style={[d.body, { color: textSecondary }]}>
            {alert.body || 'No additional details.'}
          </Text>

          {/* Area */}
          {!!alert.area && (
            <View style={[d.areaRow, { borderTopColor: isDark ? colors.dark.border : colors.slate[100] }]}>
              <Ionicons name="location" size={13} color={textSecondary} />
              <Text style={[d.areaText, { color: textSecondary }]}>{alert.area}</Text>
            </View>
          )}
        </View>

        {/* CTA */}
        {onViewIncident && (
          <Pressable
            onPress={onViewIncident}
            style={({ pressed }) => [d.ctaBtn, { backgroundColor: colors.brand[500] }, pressed && { opacity: 0.88 }]}
          >
            <Text style={d.ctaText}>View Incident</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const d = StyleSheet.create({
  backRowFixed: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 8 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLabel: { fontSize: 16, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', lineHeight: 22, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 22, marginBottom: 4 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  areaText: { fontSize: 12, fontWeight: '500' },
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 14 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

/* ═══ Screen ═══ */
export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();
  const { setUnreadCount } = useAlertBadge();
  const router = useRouter();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const bg = isDark ? colors.dark.bg : '#F8FAFB';
  const textPrimary = isDark ? colors.dark.text : colors.slate[900];
  const textSecondary = isDark ? colors.dark.subtext : colors.slate[500];

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      const data = await getAlertsWithReadState(token);
      setAlerts(data);
      queueMicrotask(() => setUnreadCount(data.filter(a => !a.read).length));
    } catch {} finally {
      setLoading(false);
    }
  }, [token, setUnreadCount]);

  useFocusEffect(useCallback(() => { setSelectedAlert(null); load(); }, [load]));

  useEffect(() => {
    const handleNew = async (raw: any) => {
      if (!raw?.id) return;
      const prefs = await getNotificationPrefs();
      const kind = raw.type;
      if (kind === 'critical' && !prefs.critical) return;
      if (kind === 'advisory' && !prefs.advisory) return;
      if (kind === 'update' && !prefs.myReports) return;
      const item = adaptAlert(raw);
      setAlerts(prev => prev.some(a => a.id === item.id) ? prev : [item, ...prev]);
    };
    const refresh = () => load(true);
    const handleAssignment = () => { setUnreadCount(c => c + 1); load(true); };

    socketService.on('new-alert', handleNew);
    socketService.on('new-notification', refresh);
    socketService.on('new-assignment', handleAssignment);
    return () => {
      socketService.off('new-alert', handleNew);
      socketService.off('new-notification', refresh);
      socketService.off('new-assignment', handleAssignment);
    };
  }, [load]);

  async function handlePress(alert: AlertItem) {
    try {
      if (!alert.read) {
        if (alert.id.startsWith('notif_')) {
          await markUserNotificationRead(alert.id, token!);
        } else {
          await markAlertRead(alert.id, token!);
        }
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a));
        queueMicrotask(() => setUnreadCount(c => Math.max(0, c - 1)));
      }
    } catch {}
    setSelectedAlert(alert);
  }

  async function handleMarkAllRead() {
    try {
      await Promise.all([
        markAllAlertsRead([], token!),
        markAllUserNotificationsRead(token!),
      ]);
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  const unreadCount = alerts.filter(a => !a.read).length;

  /* ── Grouped rendering ── */
  const renderAlert = useCallback(({ item, index }: { item: AlertItem; index: number }) => {
    const group = dateGroup(item.createdAt);
    const prevGroup = index > 0 ? dateGroup(alerts[index - 1].createdAt) : null;
    const showHeader = group !== prevGroup;
    const isFirstInGroup = showHeader;
    const nextGroup = index < alerts.length - 1 ? dateGroup(alerts[index + 1].createdAt) : null;
    const isLastInGroup = group !== nextGroup;

    return (
      <>
        {showHeader && (
          <Text style={[$.groupTitle, { color: textPrimary }]}>{group}</Text>
        )}
        {/* Grouped card wrapper */}
        <View style={[
          $.groupCard,
          { backgroundColor: isDark ? colors.dark.card : colors.white, borderColor: isDark ? colors.dark.border : 'rgba(0,0,0,0.06)' },
          isFirstInGroup && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
          isLastInGroup && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
          isFirstInGroup && { borderTopWidth: 1 },
          isLastInGroup && { borderBottomWidth: 1 },
        ]}>
          <AlertRow
            alert={item}
            isDark={isDark}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
            onPress={() => handlePress(item)}
          />
          {!isLastInGroup && (
            <View style={[$.divider, { backgroundColor: isDark ? colors.dark.border : colors.slate[100] }]} />
          )}
        </View>
      </>
    );
  }, [isDark, alerts, textPrimary, textSecondary]);

  /* ── Render ── */
  return (
    <View style={[$.root, { backgroundColor: bg }]}>
      {selectedAlert ? (
        <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
          <AlertDetail
            alert={selectedAlert}
            isDark={isDark}
            screenBg={bg}
            bottomInset={insets.bottom}
            onBack={() => setSelectedAlert(null)}
            onViewIncident={
              selectedAlert.reportId
                ? () => { const id = selectedAlert.reportId; setSelectedAlert(null); router.push(`/responder/incident/${id}` as never); }
                : undefined
            }
          />
        </View>
      ) : (
        <>
          {/* Header */}
          <View style={[$.header, { paddingTop: insets.top + 10 }]}>
            <View>
              <Text style={[$.headerTitle, { color: textPrimary }]}>Alerts</Text>
              <Text style={[$.headerSub, { color: textSecondary }]}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                {' · Nasugbu'}
              </Text>
            </View>
            {unreadCount > 0 && (
              <Pressable onPress={handleMarkAllRead} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                <Text style={[$.markAllText, { color: colors.brand[500] }]}>Mark all read</Text>
              </Pressable>
            )}
          </View>

          {/* Content */}
          {loading ? (
            <View style={$.centered}>
              <ActivityIndicator size="large" color={colors.brand[500]} />
              <Text style={[$.loadText, { color: textSecondary }]}>Fetching alerts…</Text>
            </View>
          ) : alerts.length === 0 ? (
            <View style={$.centered}>
              <View style={[$.emptyIcon, { backgroundColor: colors.brand[500] + '15' }]}>
                <Ionicons name="notifications-off-outline" size={32} color={colors.brand[500]} />
              </View>
              <Text style={[$.emptyTitle, { color: textPrimary }]}>All quiet</Text>
              <Text style={[$.emptySub, { color: textSecondary }]}>
                No alerts right now. Critical incidents will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={alerts}
              renderItem={renderAlert}
              keyExtractor={a => a.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}
    </View>
  );
}

const $ = StyleSheet.create({
  root: { flex: 1 },

  /* Header — flat */
  header: { paddingHorizontal: 20, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  markAllText: { fontSize: 14, fontWeight: '700', marginTop: 6 },

  /* Group */
  groupTitle: { fontSize: 17, fontWeight: '800', marginTop: 18, marginBottom: 10, letterSpacing: -0.2 },
  groupCard: { borderLeftWidth: 1, borderRightWidth: 1, overflow: 'hidden' },

  /* Alert row */
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 16, paddingVertical: 16 },
  alertIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  alertTitle: { fontSize: 14, lineHeight: 19, marginBottom: 4 },
  alertBody: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  alertSource: { fontSize: 12, fontWeight: '500' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand[500], marginTop: 6 },

  /* Divider */
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 74 },

  /* Empty */
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadText: { fontSize: 13, fontWeight: '600' },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
});
