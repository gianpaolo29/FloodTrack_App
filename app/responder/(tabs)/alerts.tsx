import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { getAlertsWithReadState, markAlertRead, markAllAlertsRead } from '@/services/api';
import type { AlertItem } from '@/types';

const H_PAD = 20;
const CARD_GAP = 12;
const CARD_RADIUS = 20;

function SummaryCard({
  icon,
  label,
  count,
  accentColor,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  accentColor: string;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor: isDark ? colors.dark.card : colors.white,
          borderColor: isDark ? colors.dark.border : '#E8ECF0',
        },
      ]}
    >
      <View style={[styles.summaryIcon, { backgroundColor: accentColor + '18' }]}>
        <Ionicons name={icon} size={16} color={accentColor} />
      </View>
      <Text
        style={[
          styles.summaryLabel,
          { color: isDark ? colors.dark.subtext : colors.slate[500] },
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.summaryCount, { color: accentColor }]}>{count}</Text>
    </View>
  );
}

function AlertCard({
  alert,
  isDark,
  onPress,
}: {
  alert: AlertItem;
  isDark: boolean;
  onPress: () => void;
}) {
  const isCritical = alert.kind === 'critical';
  const isStatusUpdate = alert.kind === 'status_update';

  const accentColor = isCritical
    ? colors.severity.critical
    : isStatusUpdate
    ? colors.severity.low
    : colors.brand[500];

  const iconName: keyof typeof Ionicons.glyphMap = isCritical
    ? 'alert-circle'
    : isStatusUpdate
    ? 'checkmark-circle'
    : 'information-circle';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? colors.dark.card : colors.white,
          borderColor: isDark ? colors.dark.border : '#E8ECF0',
        },
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.body}`}
    >
      <View style={styles.cardInner}>
        <View style={styles.cardTopRow}>
          <View style={[styles.iconWrap, { backgroundColor: accentColor + '18' }]}>
            <Ionicons name={iconName} size={18} color={accentColor} />
          </View>

          <View style={styles.cardTitleWrap}>
            <Text
              style={[
                styles.cardTitle,
                { color: isDark ? colors.dark.text : colors.slate[900] },
                isCritical && { color: colors.severity.critical },
                !alert.read && { fontWeight: '700' },
              ]}
              numberOfLines={2}
            >
              {alert.title}
            </Text>
          </View>

          <View style={styles.cardRight}>
            {!alert.read && (
              <View
                style={[styles.unreadDot, { backgroundColor: accentColor }]}
              />
            )}
            <Text
              style={[
                styles.timeText,
                { color: isDark ? colors.dark.subtext : colors.slate[400] },
              ]}
            >
              {alert.time}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.cardBody,
            { color: isDark ? colors.dark.subtext : colors.slate[500] },
          ]}
          numberOfLines={2}
        >
          {alert.body}
        </Text>

        <View
          style={[
            styles.cardFooter,
            {
              borderTopColor: isDark
                ? colors.dark.border
                : '#E8ECF0',
            },
          ]}
        >
          <View style={styles.footerLeft}>
            <Ionicons
              name="location-outline"
              size={12}
              color={isDark ? colors.dark.subtext : colors.slate[400]}
            />
            <Text
              style={[
                styles.footerText,
                { color: isDark ? colors.dark.subtext : colors.slate[400] },
              ]}
              numberOfLines={1}
            >
              {alert.area}
            </Text>
          </View>
          <View style={[styles.kindBadge, { backgroundColor: accentColor + '14' }]}>
            <Text style={[styles.kindText, { color: accentColor }]}>
              {isCritical ? 'Critical' : isStatusUpdate ? 'Update' : 'Advisory'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();
  const { showAlert } = useAlert();
  const router = useRouter();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      try {
        if (!isRefresh) setLoading(true);
        setError(null);
        const data = await getAlertsWithReadState(token);
        setAlerts(data);
      } catch {
        setError('Could not load alerts. Pull down to retry.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleAlertPress(alert: AlertItem) {
    try {
      if (!alert.read) {
        await markAlertRead(alert.id, token!);
        setAlerts((prev) =>
          prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a)),
        );
      }
    } catch {}
    if (alert.reportId) {
      router.push(`/responder/incident/${alert.reportId}`);
    } else {
      showAlert({
        type: alert.kind === 'critical' ? 'error' : 'info',
        title: alert.title,
        message: alert.body + (alert.area ? `\n\nArea: ${alert.area}` : ''),
      });
    }
  }

  async function handleMarkAllRead() {
    try {
      const allIds = alerts.map((a) => a.id);
      await markAllAlertsRead(allIds, token!);
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch {
    }
  }

  const criticals = alerts.filter((a) => a.kind === 'critical');
  const nonCriticals = alerts.filter((a) => a.kind !== 'critical');
  const unreadCount = alerts.filter((a) => !a.read).length;

  const screenBg = isDark ? colors.dark.bg : '#F2F4F7';
  const headerBg = isDark ? colors.dark.surface : '#F2F4F7';

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 10, backgroundColor: headerBg },
        ]}
      >
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Text
              style={[
                styles.headerTitle,
                { color: isDark ? colors.dark.text : colors.slate[900] },
              ]}
            >
              Alerts
            </Text>
            {unreadCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </View>

          {unreadCount > 0 && (
            <Pressable
              onPress={handleMarkAllRead}
              style={({ pressed }) => [
                styles.markAllBtn,
                {
                  backgroundColor: isDark ? colors.dark.card : colors.white,
                  borderColor: isDark ? colors.dark.border : '#E8ECF0',
                },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
            >
              <Ionicons
                name="checkmark-done"
                size={13}
                color={colors.brand[500]}
              />
              <Text
                style={[
                  styles.markAllText,
                  { color: isDark ? colors.dark.text : colors.slate[700] },
                ]}
              >
                Mark all read
              </Text>
            </Pressable>
          )}
        </View>

        <Text
          style={[
            styles.headerSub,
            { color: isDark ? colors.dark.subtext : colors.slate[500] },
          ]}
        >
          {loading
            ? 'Loading...'
            : unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
            : "You're all caught up"}
        </Text>
      </View>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.centered}>
          <View
            style={[
              styles.errorIconWrap,
              {
                backgroundColor: isDark ? colors.dark.card : colors.slate[100],
              },
            ]}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={colors.slate[400]}
            />
          </View>
          <Text
            style={[
              styles.errorTitle,
              { color: isDark ? colors.dark.text : colors.slate[900] },
            ]}
          >
            Connection issue
          </Text>
          <Text
            style={[
              styles.errorBody,
              { color: isDark ? colors.dark.subtext : colors.slate[500] },
            ]}
          >
            {error}
          </Text>
          <Pressable
            onPress={() => load()}
            style={styles.retryBtn}
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={15} color={colors.white} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 100 },
            alerts.length === 0 && styles.scrollEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={colors.brand[500]}
              colors={[colors.brand[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {alerts.length > 0 && (
            <View style={styles.summaryRow}>
              <SummaryCard
                icon="alert-circle"
                label="Critical Alerts"
                count={criticals.length}
                accentColor={colors.severity.critical}
                isDark={isDark}
              />
              <SummaryCard
                icon="information-circle"
                label="Advisories"
                count={nonCriticals.length}
                accentColor={colors.brand[500]}
                isDark={isDark}
              />
            </View>
          )}

          {alerts.length > 0 && (
            <View style={styles.alertList}>
              {criticals.map((a) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  isDark={isDark}
                  onPress={() => handleAlertPress(a)}
                />
              ))}
              {nonCriticals.map((a) => (
                <AlertCard
                  key={a.id}
                  alert={a}
                  isDark={isDark}
                  onPress={() => handleAlertPress(a)}
                />
              ))}
            </View>
          )}

          {alerts.length === 0 && (
            <View style={styles.emptyState}>
              <View
                style={[
                  styles.emptyIconWrap,
                  {
                    backgroundColor: isDark
                      ? colors.dark.card
                      : colors.slate[100],
                  },
                ]}
              >
                <Ionicons
                  name="notifications-off-outline"
                  size={40}
                  color={colors.slate[400]}
                />
              </View>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: isDark ? colors.dark.text : colors.slate[900] },
                ]}
              >
                All quiet
              </Text>
              <Text
                style={[
                  styles.emptySub,
                  { color: isDark ? colors.dark.subtext : colors.slate[400] },
                ]}
              >
                No active alerts right now.{'\n'}Critical incidents will appear
                here immediately.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },

  header: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.severity.critical,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerSub: {
    fontSize: 13,
    marginTop: 2,
  },

  scroll: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    gap: CARD_GAP,
  },
  scrollEmpty: { flex: 1, justifyContent: 'center' },

  summaryRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  alertList: {
    gap: CARD_GAP,
  },

  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardInner: {
    padding: 16,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitleWrap: { flex: 1, paddingTop: 2 },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
    paddingTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 46,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 2,
    borderTopWidth: 1,
    paddingLeft: 46,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  footerText: {
    fontSize: 11,
    flex: 1,
  },
  kindBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  kindText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  errorBody: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
    marginTop: 4,
  },
  retryText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },

  emptyState: { alignItems: 'center', gap: 16 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
