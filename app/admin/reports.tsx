import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { getAdminReports, updateAdminReportStatus } from '@/services/api';
import * as Storage from '@/utils/storage';
import { ADMIN_AUTO_PROCESS_KEY } from './settings';
import type { AdminReport } from '@/types';

const SEVERITY_COLORS: Record<string, string> = {
  low:      colors.severity.low,
  moderate: colors.severity.moderate,
  high:     colors.severity.high,
  critical: colors.severity.critical,
};

const STATUS_COLORS: Record<string, string> = {
  pending:  '#F59E0B',
  verified: '#3B82F6',
  assigned: '#8B5CF6',
  resolved: colors.severity.low,
  rejected: colors.severity.critical,
};

type FilterTab = 'pending' | 'all';

export default function AdminReports() {
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const router  = useRouter();
  const { token } = useAuth();

  const [reports,       setReports]       = useState<AdminReport[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [processing,    setProcessing]    = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autoSummary,   setAutoSummary]   = useState<{ verified: number; rejected: number } | null>(null);
  const [tab,           setTab]           = useState<FilterTab>('pending');

  const bg            = isDark ? colors.dark.bg      : '#F2F4F7';
  const cardBg        = isDark ? colors.dark.card    : colors.white;
  const cardBorder    = isDark ? colors.dark.border  : '#E8ECF0';
  const textPrimary   = isDark ? colors.white        : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400]   : colors.slate[500];

  async function fetchReports() {
    if (!token) return [];
    const data = await getAdminReports(token);
    setReports(data);
    return data;
  }

  async function runAutoProcess(data: AdminReport[]) {
    if (!token) return;
    const pending   = data.filter(r => r.status === 'pending');
    const toVerify  = pending.filter(r => r.aiImageVerified === true && !r.aiFlagged && !r.aiHasDuplicate);
    const toReject  = pending.filter(r => r.aiImageVerified === false && !r.aiHasDuplicate);

    if (toVerify.length === 0 && toReject.length === 0) return;

    setProcessing(true);
    try {
      await Promise.all([
        ...toVerify.map(r => updateAdminReportStatus(r.id, 'verified', token).catch(() => {})),
        ...toReject.map(r => updateAdminReportStatus(r.id, 'rejected', token).catch(() => {})),
      ]);
      setAutoSummary({ verified: toVerify.length, rejected: toReject.length });
      const fresh = await getAdminReports(token);
      setReports(fresh);
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await fetchReports();
        const autoProcessEnabled = await Storage.getItem(ADMIN_AUTO_PROCESS_KEY);
        if (data.length > 0 && autoProcessEnabled === '1') {
          await runAutoProcess(data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try { await fetchReports(); } finally { setRefreshing(false); }
  }

  async function handleAction(report: AdminReport, action: 'verified' | 'rejected') {
    if (!token || actionLoading) return;
    setActionLoading(report.id + action);
    try {
      await updateAdminReportStatus(report.id, action, token);
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: action } : r));
    } catch {
    } finally {
      setActionLoading(null);
    }
  }

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const filtered     = tab === 'pending'
    ? reports.filter(r => r.status === 'pending')
    : reports;

  if (loading) {
    return (
      <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={$.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      </View>
    );
  }

  return (
    <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand[500]}
            colors={[colors.brand[500]]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={$.header}>
          <Pressable onPress={() => router.back()} style={[$.backBtn, { borderColor: cardBorder }]}>
            <Ionicons name="arrow-back" size={18} color={textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[$.headerTitle, { color: textPrimary }]}>Report Management</Text>
            <Text style={[$.headerSub, { color: textSecondary }]}>
              {reports.length} total · {pendingCount} pending
            </Text>
          </View>
          {processing && <ActivityIndicator size="small" color={colors.brand[500]} />}
        </View>

        {/* Auto-processing summary banner */}
        {autoSummary && (autoSummary.verified > 0 || autoSummary.rejected > 0) && (
          <View style={[$.summaryBanner, { backgroundColor: colors.brand[500] + '12', borderColor: colors.brand[500] + '30' }]}>
            <Ionicons name="sparkles" size={14} color={colors.brand[500]} />
            <Text style={[$.summaryText, { color: colors.brand[500] }]}>
              {'AI auto-processed: '}
              {autoSummary.verified > 0 ? `${autoSummary.verified} verified` : ''}
              {autoSummary.verified > 0 && autoSummary.rejected > 0 ? ', ' : ''}
              {autoSummary.rejected > 0 ? `${autoSummary.rejected} rejected (no flood in photo)` : ''}
            </Text>
          </View>
        )}

        {/* Filter tabs */}
        <View style={[$.tabRow, { borderBottomColor: cardBorder }]}>
          {([
            { key: 'pending' as const, label: 'Needs Review', count: pendingCount },
            { key: 'all'     as const, label: 'All Reports',  count: reports.length },
          ]).map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[$.tab, tab === t.key && { borderBottomColor: colors.brand[500] }]}
            >
              <Text style={[$.tabLabel, { color: tab === t.key ? colors.brand[500] : textSecondary }]}>
                {t.label}
              </Text>
              {t.count > 0 && (
                <View style={[$.tabBadge, { backgroundColor: tab === t.key ? colors.brand[500] : colors.slate[400] }]}>
                  <Text style={$.tabBadgeText}>{t.count}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {/* Report list */}
        {filtered.length === 0 ? (
          <View style={$.empty}>
            <Ionicons name="checkmark-circle-outline" size={44} color={textSecondary} />
            <Text style={[$.emptyTitle, { color: textPrimary }]}>All caught up!</Text>
            <Text style={[$.emptyText, { color: textSecondary }]}>No pending reports to review.</Text>
          </View>
        ) : (
          <View style={$.list}>
            {filtered.map(report => {
              const isDuplicate = report.aiHasDuplicate;
              const imageFailed = report.aiImageVerified === false;
              const textFlagged = report.aiFlagged && !isDuplicate && !imageFailed;
              const imageOk     = report.aiImageVerified === true && !report.aiFlagged;
              const isPending   = report.status === 'pending';

              const aiBadgeColor = isDuplicate || imageFailed || textFlagged
                ? colors.severity.moderate
                : imageOk
                ? colors.severity.low
                : null;

              const aiBadgeLabel = isDuplicate ? 'Duplicate report'
                : imageFailed    ? 'No flood in photo'
                : textFlagged    ? 'Suspicious text'
                : imageOk        ? 'AI verified'
                : null;

              const isApproving = actionLoading === report.id + 'verified';
              const isRejecting = actionLoading === report.id + 'rejected';

              return (
                <View
                  key={report.id}
                  style={[
                    $.card,
                    { backgroundColor: cardBg, borderColor: aiBadgeColor ? aiBadgeColor + '40' : cardBorder },
                  ]}
                >
                  {/* Top row: info + thumbnail */}
                  <View style={$.cardTop}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={$.cardRefRow}>
                        <View style={[$.sevChip, { backgroundColor: (SEVERITY_COLORS[report.severity] ?? colors.slate[400]) + '18' }]}>
                          <View style={[$.sevDot, { backgroundColor: SEVERITY_COLORS[report.severity] ?? colors.slate[400] }]} />
                          <Text style={[$.sevText, { color: SEVERITY_COLORS[report.severity] ?? colors.slate[400] }]}>
                            {report.severity}
                          </Text>
                        </View>
                        <View style={[$.statusPill, { backgroundColor: (STATUS_COLORS[report.status] ?? colors.slate[400]) + '20' }]}>
                          <Text style={[$.statusText, { color: STATUS_COLORS[report.status] ?? colors.slate[400] }]}>
                            {report.status}
                          </Text>
                        </View>
                      </View>
                      <Text style={[$.cardRef, { color: textPrimary }]}>{report.reference}</Text>
                      <Text style={[$.cardAddr, { color: textSecondary }]} numberOfLines={2}>
                        {report.address}
                      </Text>
                      <Text style={[$.cardMeta, { color: textSecondary }]}>
                        {report.reportedAt} · {report.reportedByName}
                      </Text>
                      {aiBadgeLabel && (
                        <View style={[$.aiBadge, { backgroundColor: (aiBadgeColor ?? colors.slate[400]) + '18' }]}>
                          <Ionicons name="sparkles" size={10} color={aiBadgeColor ?? colors.slate[400]} />
                          <Text style={[$.aiBadgeText, { color: aiBadgeColor ?? colors.slate[400] }]}>
                            {aiBadgeLabel}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!!report.thumbnailUrl && (
                      <Image
                        source={{ uri: report.thumbnailUrl }}
                        style={$.thumbnail}
                        resizeMode="cover"
                      />
                    )}
                    {!report.thumbnailUrl && report.mediaCount === 0 && (
                      <View style={[$.noPhoto, { backgroundColor: cardBorder }]}>
                        <Ionicons name="image-outline" size={18} color={textSecondary} />
                        <Text style={[$.noPhotoText, { color: textSecondary }]}>No photo</Text>
                      </View>
                    )}
                  </View>

                  {/* Report description */}
                  {!!report.description && (
                    <View style={[$.descRow, { borderTopColor: cardBorder }]}>
                      <Text style={[$.descLabel, { color: textSecondary }]}>Description</Text>
                      <Text style={[$.descText, { color: textPrimary }]}>{report.description}</Text>
                    </View>
                  )}

                  {/* AI analysis notes */}
                  {(!!report.aiImageNotes || !!report.aiFlagReason) && (
                    <View style={[$.aiNotesBlock, { borderTopColor: cardBorder, backgroundColor: (aiBadgeColor ?? colors.slate[400]) + '08' }]}>
                      <View style={$.aiNotesHeader}>
                        <Ionicons name="sparkles" size={12} color={aiBadgeColor ?? colors.slate[400]} />
                        <Text style={[$.aiNotesTitle, { color: aiBadgeColor ?? colors.slate[400] }]}>AI Analysis</Text>
                      </View>
                      {!!report.aiImageNotes && (
                        <Text style={[$.aiNotesText, { color: textPrimary }]}>{report.aiImageNotes}</Text>
                      )}
                      {!!report.aiFlagReason && (
                        <View style={[$.flagReasonRow, { borderTopColor: (aiBadgeColor ?? colors.slate[400]) + '20' }]}>
                          <Ionicons name="warning-outline" size={11} color={colors.severity.moderate} />
                          <Text style={[$.flagReasonText, { color: colors.severity.moderate }]}>{report.aiFlagReason}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Approve / Reject buttons — only for pending */}
                  {isPending && (
                    <View style={[$.actionRow, { borderTopColor: cardBorder }]}>
                      <Pressable
                        onPress={() => handleAction(report, 'rejected')}
                        disabled={!!actionLoading}
                        style={({ pressed }) => [
                          $.rejectBtn,
                          { borderColor: colors.severity.critical + '60' },
                          pressed && { opacity: 0.7 },
                          !!actionLoading && { opacity: 0.4 },
                        ]}
                      >
                        {isRejecting ? (
                          <ActivityIndicator size="small" color={colors.severity.critical} />
                        ) : (
                          <>
                            <Ionicons name="close-circle" size={14} color={colors.severity.critical} />
                            <Text style={$.rejectText}>Reject</Text>
                          </>
                        )}
                      </Pressable>

                      <Pressable
                        onPress={() => handleAction(report, 'verified')}
                        disabled={!!actionLoading}
                        style={({ pressed }) => [
                          $.approveBtn,
                          { backgroundColor: colors.brand[500] },
                          pressed && { opacity: 0.7 },
                          !!actionLoading && { opacity: 0.4 },
                        ]}
                      >
                        {isApproving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={14} color="#fff" />
                            <Text style={$.approveText}>Approve</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const $ = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, fontWeight: '500', marginTop: 2 },

  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryText: { flex: 1, fontSize: 12, fontWeight: '600' },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel:     { fontSize: 13, fontWeight: '700' },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  emptyText:  { fontSize: 13, fontWeight: '500' },

  list: {
    paddingHorizontal: 16,
    gap: 10,
  },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
  },
  cardRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sevChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sevDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sevText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  cardRef:  { fontSize: 14, fontWeight: '700' },
  cardAddr: { fontSize: 12, fontWeight: '500' },
  cardMeta: { fontSize: 11, fontWeight: '400' },

  statusPill: {
    marginLeft: 'auto' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },

  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
    flexShrink: 0,
  },
  noPhoto: {
    width: 72,
    height: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
  },
  noPhotoText: { fontSize: 9, fontWeight: '600' },

  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  aiBadgeText: { fontSize: 10, fontWeight: '700' },

  descRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 3,
  },
  descLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  descText:  { fontSize: 12, fontWeight: '500', lineHeight: 18 },

  aiNotesBlock: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  aiNotesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  aiNotesTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  aiNotesText:  { fontSize: 12, fontWeight: '500', lineHeight: 18 },
  flagReasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingTop: 6,
    borderTopWidth: 1,
    marginTop: 2,
  },
  flagReasonText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  rejectText: { fontSize: 13, fontWeight: '700', color: colors.severity.critical },

  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
  },
  approveText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
