import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useAlert } from '@/context/AlertContext';
import { SeverityChip } from '@/components/SeverityChip';
import { StatusBadge } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getMyReports } from '@/services/api';
import type { Report, ReportStatus } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');

const HEADER_GRADIENT: [string, string, string] = ['#00D2FF', '#4A6CF7', '#7C3AED'];

type FilterTab = 'all' | 'active' | 'resolved';

const ACTIVE_STATUSES: ReportStatus[] = ['pending', 'verified', 'assigned'];

function ReportCard({
  report,
  onPress,
  isDark,
  animValue,
}: {
  report: Report;
  onPress: () => void;
  isDark: boolean;
  animValue: Animated.Value;
}) {
  const hasPhoto = !!report.thumbnailUrl;

  const cardStyle = {
    opacity: animValue,
    transform: [
      {
        translateY: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [32, 0],
        }),
      },
      {
        scale: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };

  const severityColor = colors.severity[report.severity];

  return (
    <Animated.View style={cardStyle}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          isDark && {
            backgroundColor: colors.dark.elevated,
            borderColor: colors.dark.border,
            borderWidth: 1,
          },
          pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${report.title}, ${report.severity} severity, status ${report.status}`}
      >
        {hasPhoto && (
          <View style={styles.photoHeader}>
            <Image
              source={{ uri: report.thumbnailUrl }}
              style={styles.photoHeaderImg}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.45)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View
              style={[styles.photoSeverityBar, { backgroundColor: severityColor }]}
            />
            {(report.mediaCount ?? 0) > 1 && (
              <View style={styles.photoBadge}>
                <Ionicons name="camera" size={10} color={colors.white} />
                <Text style={styles.photoBadgeText}>{report.mediaCount}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.cardRow}>
          {!hasPhoto && (
            <LinearGradient
              colors={[severityColor, severityColor + 'AA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardBar}
            />
          )}

          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <Text
                style={[styles.cardTitle, isDark && { color: colors.white }]}
                numberOfLines={1}
              >
                {report.title}
              </Text>
              <View style={[styles.chevronWrap, isDark && { backgroundColor: colors.dark.border }]}>
                <Ionicons name="chevron-forward" size={13} color={isDark ? colors.slate[400] : colors.slate[500]} />
              </View>
            </View>

            <View style={styles.cardMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="layers-outline" size={12} color={colors.slate[400]} />
                <Text style={[styles.metaText, isDark && { color: colors.slate[400] }]}>
                  {report.type}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={12} color={colors.slate[400]} />
                <Text
                  style={[styles.metaText, isDark && { color: colors.slate[400] }]}
                  numberOfLines={1}
                >
                  {report.address}
                </Text>
              </View>
            </View>

            <View style={styles.cardChips}>
              <SeverityChip level={report.severity} size="sm" />
              <StatusBadge status={report.status} size="sm" />
            </View>

            <View
              style={[
                styles.cardFooter,
                isDark && { borderTopColor: colors.dark.border },
              ]}
            >
              <Text style={[styles.cardRef, isDark && { color: colors.slate[500] }]}>
                {report.reference}
              </Text>
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={11} color={colors.slate[400]} />
                <Text style={[styles.cardTime, isDark && { color: colors.slate[500] }]}>
                  {report.reportedAt}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function EmptyState({
  tab,
  isDark,
  children,
}: {
  tab: FilterTab;
  isDark: boolean;
  children: React.ReactNode;
}) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -10, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [bounce]);

  const title =
    tab === 'active'
      ? 'No Active Reports'
      : tab === 'resolved'
      ? 'No Closed Reports'
      : 'No Reports Yet';

  return (
    <View style={styles.emptyState}>
      <Animated.View style={{ transform: [{ translateY: bounce }] }}>
        <LinearGradient
          colors={['#4A6CF722', '#7C3AED11']}
          style={styles.emptyIconBadge}
        >
          <LinearGradient
            colors={['#4A6CF733', '#7C3AED22']}
            style={styles.emptyIconBadgeInner}
          >
            <Ionicons name="document-text-outline" size={44} color="#4A6CF7" />
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
      <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export default function MyReportsScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';
  const { token } = useAuth();
  const { showAlert } = useAlert();

  const [reports, setReports]       = useState<Report[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [tab, setTab]               = useState<FilterTab>('all');

  const cardAnims = useRef<Animated.Value[]>([]);

  const screenBg = isDark ? colors.dark.bg : colors.slate[50];

  const headerAnim = useRef(new Animated.Value(0)).current;
  const tabsAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.timing(headerAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(tabsAnim,   { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getMyReports(token!);
      setReports(data);
    } catch {
      setError('Could not load reports. Pull down to retry.');
      if (!isRefresh)
        showAlert({
          type: 'error',
          title: 'Load Failed',
          message: 'Could not load your reports. Check your connection.',
        });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    load(true);
  }

  const filtered = reports.filter(r => {
    if (tab === 'active')   return ACTIVE_STATUSES.includes(r.status);
    if (tab === 'resolved') return r.status === 'resolved' || r.status === 'rejected';
    return true;
  });

  useEffect(() => {
    cardAnims.current = filtered.map(() => new Animated.Value(0));
    if (filtered.length === 0) return;
    const anims = cardAnims.current.map((av, i) =>
      Animated.timing(av, {
        toValue: 1,
        duration: 380,
        delay: i * 60,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    Animated.stagger(60, anims).start();
  }, [filtered.length, tab]);

  const allCount      = reports.length;
  const activeCount   = reports.filter(r => ACTIVE_STATUSES.includes(r.status)).length;
  const resolvedCount = reports.filter(r => ['resolved', 'rejected'].includes(r.status)).length;

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all',      label: 'All',    count: allCount      },
    { key: 'active',   label: 'Active', count: activeCount   },
    { key: 'resolved', label: 'Closed', count: resolvedCount },
  ];

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <Animated.View
        style={{
          opacity: headerAnim,
          transform: [
            {
              translateY: headerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-20, 0],
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={HEADER_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <View style={[styles.orb, styles.orb1]} />
          <View style={[styles.orb, styles.orb2]} />

          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>My Reports</Text>
              {!loading && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {allCount} {allCount === 1 ? 'report' : 'reports'}
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => router.push('/resident/report')}
              accessibilityRole="button"
              accessibilityLabel="Submit new report"
              style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.12)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.newBtn}
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.newBtnText}>New Report</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={[styles.waveWrap, { backgroundColor: isDark ? colors.dark.bg : colors.slate[50] }]}>
          <LinearGradient
            colors={['#5E52EF', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View
            style={[
              styles.waveShape,
              { backgroundColor: isDark ? colors.dark.bg : colors.slate[50] },
            ]}
          />
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.tabRow,
          isDark && { backgroundColor: colors.dark.surface },
          {
            opacity: tabsAnim,
            transform: [
              {
                translateY: tabsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
        ]}
      >
        {TABS.map(t => {
          const isActive = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={styles.tabItemWrap}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#4A6CF7', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabChipActive}
                >
                  <Text style={styles.tabLabelActive}>{t.label}</Text>
                  <View style={styles.tabCountBubble}>
                    <Text style={styles.tabCountActive}>{t.count}</Text>
                  </View>
                </LinearGradient>
              ) : (
                <View
                  style={[
                    styles.tabChip,
                    isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                  ]}
                >
                  <Text style={[styles.tabLabel, isDark && { color: colors.slate[400] }]}>
                    {t.label}
                  </Text>
                  <View
                    style={[
                      styles.tabCountBubbleInactive,
                      isDark && { backgroundColor: colors.dark.border },
                    ]}
                  >
                    <Text style={[styles.tabCountInactive, isDark && { color: colors.slate[400] }]}>
                      {t.count}
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </Animated.View>

      {loading && (
        <View style={styles.centered}>
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="large" color="#4A6CF7" />
          </View>
          <Text style={[styles.loadingText, isDark && { color: colors.slate[400] }]}>
            Loading your reports…
          </Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.centered}>
          <LinearGradient
            colors={['#FF6B6B22', '#FF6B6B11']}
            style={styles.errorIconBadge}
          >
            <Ionicons name="cloud-offline-outline" size={40} color="#E53E3E" />
          </LinearGradient>
          <Text style={[styles.errorTitle, isDark && { color: colors.white }]}>
            Connection Error
          </Text>
          <Text style={[styles.errorSub, isDark && { color: colors.slate[400] }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => load()}
            accessibilityRole="button"
            style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
          >
            <LinearGradient
              colors={['#4A6CF7', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.retryBtn}
            >
              <Ionicons name="refresh" size={15} color={colors.white} />
              <Text style={styles.retryText}>Try Again</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {!loading && !error && (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            filtered.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#4A6CF7"
              colors={['#4A6CF7', '#7C3AED']}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState tab={tab} isDark={isDark}>
              <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                {tab === 'active'
                  ? 'All your reports are resolved or awaiting submission.'
                  : tab === 'resolved'
                  ? "Reports that have been closed will appear here."
                  : 'Tap "+ New Report" above to submit your first flood report.'}
              </Text>
              {tab === 'all' && (
                <Pressable
                  onPress={() => router.push('/resident/report')}
                  style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <LinearGradient
                    colors={['#4A6CF7', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.emptyActionBtn}
                  >
                    <Ionicons name="add-circle-outline" size={17} color={colors.white} />
                    <Text style={styles.emptyActionText}>Submit a Report</Text>
                  </LinearGradient>
                </Pressable>
              )}
            </EmptyState>
          ) : (
            filtered.map((r, i) => (
              <ReportCard
                key={r.id}
                report={r}
                isDark={isDark}
                animValue={cardAnims.current[i] ?? new Animated.Value(1)}
                onPress={() => router.push(`/resident/report/${r.id}`)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 28,
  },

  header: {
    paddingHorizontal: 22,
    paddingBottom: 44,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  countBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  newBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orb1: { width: 180, height: 180, top: -70, right: -50 },
  orb2: { width: 110, height: 110, bottom: 0, left: -30, backgroundColor: 'rgba(255,255,255,0.04)' },

  waveWrap: {
    height: 48,
    position: 'relative',
    marginTop: -1,
  },
  waveShape: {
    position: 'absolute',
    bottom: 0,
    left: -12,
    right: -12,
    height: 52,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: colors.white,
  },
  tabItemWrap: { flex: 1 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: colors.slate[100],
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  tabChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 24,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate[500],
  },
  tabLabelActive: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  tabCountBubble: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  tabCountActive: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  tabCountBubbleInactive: {
    backgroundColor: colors.slate[200],
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  tabCountInactive: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[500],
  },

  list:      { padding: 16, gap: 14 },
  listEmpty: { flex: 1 },

  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 5,
  },
  photoHeader: {
    position: 'relative',
    height: 160,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  photoHeaderImg:    { width: '100%', height: '100%' },
  photoSeverityBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 4,
  },
  photoBadge: {
    position: 'absolute', bottom: 10, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  photoBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },

  cardRow:  { flexDirection: 'row' },
  cardBar:  { width: 4 },
  cardBody: { flex: 1, padding: 16, gap: 10 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate[900],
    letterSpacing: 0.1,
  },
  chevronWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta:  { gap: 5 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:  { fontSize: 12, color: colors.slate[500], flex: 1 },
  cardChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingTop: 10,
    marginTop: 2,
  },
  cardRef:  { fontSize: 11, color: colors.slate[400], fontWeight: '600', letterSpacing: 0.2 },
  cardTime: { fontSize: 11, color: colors.slate[400] },

  loadingBadge: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#F0F2FF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  loadingText: {
    fontSize: 14,
    color: colors.slate[500],
    fontWeight: '500',
  },

  errorIconBadge: {
    width: 90, height: 90, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.slate[900],
    letterSpacing: 0.2,
  },
  errorSub: {
    fontSize: 13,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: SCREEN_W * 0.72,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  emptyState: { alignItems: 'center', gap: 14, paddingTop: 56 },
  emptyIconBadge: {
    width: 110, height: 110, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconBadgeInner: {
    width: 84, height: 84, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.slate[900],
    letterSpacing: 0.2,
  },
  emptySub: {
    fontSize: 13,
    color: colors.slate[400],
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: SCREEN_W * 0.72,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 24,
    marginTop: 6,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.2,
  },
});
