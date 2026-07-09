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

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAdminStats } from '@/services/api';
import type { AdminStats } from '@/types';

const SEVERITY_COLORS: Record<string, string> = {
  low: colors.severity.low,
  moderate: colors.severity.moderate,
  high: colors.severity.high,
  critical: colors.severity.critical,
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  verified: '#3B82F6',
  assigned: '#8B5CF6',
  resolved: colors.severity.low,
  rejected: colors.severity.critical,
};

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, logout } = useAuth();

  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const bg = isDark ? colors.dark.bg : '#F2F4F7';
  const cardBg = isDark ? colors.dark.card : colors.white;
  const cardBorder = isDark ? colors.dark.border : '#E8ECF0';
  const textPrimary = isDark ? colors.white : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[500];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const stats = await getAdminStats(token!);
      setData(stats);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={$.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      </View>
    );
  }

  const s = data?.stats;

  return (
    <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(true); }}
            tintColor={colors.accent[500]}
            colors={[colors.accent[500]]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={$.header}>
          <View>
            <Text style={[$.headerTitle, { color: textPrimary }]}>Admin Dashboard</Text>
            <Text style={[$.headerSub, { color: textSecondary }]}>System overview</Text>
          </View>
          <Pressable onPress={logout} style={[$.logoutBtn, { borderColor: cardBorder }]}>
            <Ionicons name="log-out-outline" size={18} color={colors.severity.critical} />
          </Pressable>
        </View>

        {s && (
          <>
            <View style={$.grid}>
              <StatCard label="Total Reports" value={s.total_reports} icon="document-text" color="#3B82F6" trend={data.trends.reports} cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} isDark={isDark} />
              <StatCard label="Pending" value={s.pending} icon="time" color="#F59E0B" cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} isDark={isDark} />
              <StatCard label="Active" value={s.active} icon="warning" color="#8B5CF6" cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} isDark={isDark} />
              <StatCard label="Resolved Today" value={s.resolved_today} icon="checkmark-circle" color={colors.severity.low} trend={data.trends.resolved} cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} isDark={isDark} />
              <StatCard label="Total Users" value={s.total_users} icon="people" color="#0EA5E9" cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} isDark={isDark} />
              <StatCard label="Responders" value={s.total_responders} icon="shield" color={colors.accent[500]} cardBg={cardBg} cardBorder={cardBorder} textPrimary={textPrimary} textSecondary={textSecondary} isDark={isDark} />
            </View>

            <Text style={[$.sectionTitle, { color: textPrimary }]}>Severity Breakdown</Text>
            <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {Object.entries(data.severity_breakdown).map(([key, count]) => {
                const total = Object.values(data.severity_breakdown).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <View key={key} style={$.breakdownRow}>
                    <View style={[$.breakdownDot, { backgroundColor: SEVERITY_COLORS[key] ?? colors.slate[400] }]} />
                    <Text style={[$.breakdownLabel, { color: textPrimary }]}>{key}</Text>
                    <View style={$.breakdownBarBg}>
                      <View style={[$.breakdownBar, { width: `${pct}%`, backgroundColor: SEVERITY_COLORS[key] ?? colors.slate[400] }]} />
                    </View>
                    <Text style={[$.breakdownCount, { color: textSecondary }]}>{count}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={[$.sectionTitle, { color: textPrimary }]}>Status Breakdown</Text>
            <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {Object.entries(data.status_breakdown).map(([key, count]) => {
                const total = Object.values(data.status_breakdown).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <View key={key} style={$.breakdownRow}>
                    <View style={[$.breakdownDot, { backgroundColor: STATUS_COLORS[key] ?? colors.slate[400] }]} />
                    <Text style={[$.breakdownLabel, { color: textPrimary }]}>{key}</Text>
                    <View style={$.breakdownBarBg}>
                      <View style={[$.breakdownBar, { width: `${pct}%`, backgroundColor: STATUS_COLORS[key] ?? colors.slate[400] }]} />
                    </View>
                    <Text style={[$.breakdownCount, { color: textSecondary }]}>{count}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={[$.sectionTitle, { color: textPrimary }]}>Recent Reports</Text>
            {data.recent_reports.map(report => (
              <View key={report.id} style={[$.recentCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={[$.recentDot, { backgroundColor: SEVERITY_COLORS[report.severity] ?? colors.slate[400] }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[$.recentRef, { color: textPrimary }]}>{report.reference_number}</Text>
                  <Text style={[$.recentAddr, { color: textSecondary }]} numberOfLines={1}>{report.address}</Text>
                </View>
                <View style={[$.statusBadge, { backgroundColor: (STATUS_COLORS[report.status] ?? colors.slate[400]) + '20' }]}>
                  <Text style={[$.statusText, { color: STATUS_COLORS[report.status] ?? colors.slate[400] }]}>{report.status}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({
  label, value, icon, color, trend, cardBg, cardBorder, textPrimary, textSecondary, isDark,
}: {
  label: string; value: number; icon: string; color: string; trend?: number;
  cardBg: string; cardBorder: string; textPrimary: string; textSecondary: string; isDark: boolean;
}) {
  return (
    <View style={[$.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <View style={[$.statIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color={color} />
      </View>
      <Text style={[$.statValue, { color: textPrimary }]}>{value}</Text>
      <Text style={[$.statLabel, { color: textSecondary }]}>{label}</Text>
      {trend !== undefined && trend !== 0 && (
        <View style={$.trendRow}>
          <Ionicons
            name={trend > 0 ? 'trending-up' : 'trending-down'}
            size={12}
            color={trend > 0 ? colors.severity.critical : colors.severity.low}
          />
          <Text style={{ fontSize: 10, fontWeight: '700', color: trend > 0 ? colors.severity.critical : colors.severity.low }}>
            {trend > 0 ? '+' : ''}{trend}%
          </Text>
        </View>
      )}
    </View>
  );
}

const $ = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },

  statCard: {
    width: '47%',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '800', letterSpacing: -1 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },

  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { fontSize: 13, fontWeight: '600', width: 75, textTransform: 'capitalize' },
  breakdownBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  breakdownBar: { height: 8, borderRadius: 4 },
  breakdownCount: { fontSize: 13, fontWeight: '700', width: 35, textAlign: 'right' },

  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  recentDot: { width: 10, height: 10, borderRadius: 5 },
  recentRef: { fontSize: 13, fontWeight: '700' },
  recentAddr: { fontSize: 11, fontWeight: '500' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
});
