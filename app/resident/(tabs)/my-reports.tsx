import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
import { socketService } from '@/services/socket';
import type { Report, ReportStatus } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');

const HEADER_GRADIENT: [string, string, string] = ['#00D2FF', '#4A6CF7', '#7C3AED'];

type FilterTab = 'all' | 'active' | 'resolved';

const ACTIVE_STATUSES: ReportStatus[] = ['pending', 'verified', 'assigned'];

/* ── Report‑type icon mapping ── */
const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Flood':           'water-outline',
  'Flood report':    'water-outline',
  'Flash flood':     'thunderstorm-outline',
  'River flood':     'water-outline',
  'Coastal flood':   'boat-outline',
  'Urban flood':     'business-outline',
  'flood':           'water-outline',
};

function getTypeIcon(type: string): keyof typeof Ionicons.glyphMap {
  return TYPE_ICONS[type] ?? 'document-text-outline';
}

/* ── Compact Report Card ── */
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
  const severityColor = colors.severity[report.severity];

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
        {/* Severity left bar */}
        <View style={[styles.severityBar, { backgroundColor: severityColor }]} />

        <View style={styles.cardRow}>
          {/* Thumbnail */}
          {hasPhoto && (
            <View style={styles.thumbWrap}>
              <Image
                source={{ uri: report.thumbnailUrl }}
                style={styles.thumbImg}
                resizeMode="cover"
              />
              {(report.mediaCount ?? 0) > 1 && (
                <View style={styles.photoBadge}>
                  <Ionicons name="camera" size={9} color={colors.white} />
                  <Text style={styles.photoBadgeText}>{report.mediaCount}</Text>
                </View>
              )}
            </View>
          )}

          {/* Body */}
          <View style={[styles.cardBody, !hasPhoto && { paddingLeft: 12 }]}>
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
                <Ionicons name={getTypeIcon(report.type)} size={12} color={isDark ? colors.slate[400] : colors.slate[500]} />
                <Text style={[styles.metaText, isDark && { color: colors.slate[400] }]}>
                  {report.type}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={12} color={colors.slate[400]} />
                <Text
                  style={[styles.metaText, isDark && { color: colors.slate[400] }]}
                  numberOfLines={2}
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
  const [search, setSearch]         = useState('');

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
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getMyReports(token);
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

  useEffect(() => {
    const refresh = () => load(true);
    socketService.on('report-status', refresh);
    return () => socketService.off('report-status', refresh);
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    load(true);
  }

  const filtered = useMemo(() => {
    let list = reports;

    // Tab filter
    if (tab === 'active')   list = list.filter(r => ACTIVE_STATUSES.includes(r.status));
    if (tab === 'resolved') list = list.filter(r => r.status === 'resolved' || r.status === 'rejected');

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q)
      );
    }

    return list;
  }, [reports, tab, search]);

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

  const TABS: { key: FilterTab; label: string; count: number; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'all',      label: 'All',    count: allCount,      icon: 'layers-outline'        },
    { key: 'active',   label: 'Active', count: activeCount,   icon: 'radio-button-on'       },
    { key: 'resolved', label: 'Closed', count: resolvedCount, icon: 'checkmark-circle-outline' },
  ];

  const renderCard = useCallback(({ item, index }: { item: Report; index: number }) => (
    <ReportCard
      report={item}
      isDark={isDark}
      animValue={cardAnims.current[index] ?? new Animated.Value(1)}
      onPress={() => router.push(`/resident/report/${item.id}`)}
    />
  ), [isDark]);

  const itemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

  const listEmpty = useMemo(() => (
    <EmptyState tab={tab} isDark={isDark}>
      <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
        {tab === 'active'
          ? 'All your reports are resolved or awaiting submission.'
          : tab === 'resolved'
          ? "Reports that have been closed will appear here."
          : search.trim()
          ? 'No reports match your search.'
          : 'Use the report button below to submit your first flood report.'}
      </Text>
      {tab === 'all' && !search.trim() && (
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
  ), [tab, isDark, search]);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* Header */}
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
            <Text style={styles.headerTitle}>My Reports</Text>
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

      {/* Tabs */}
      <Animated.View
        style={[
          styles.tabRow,
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
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.8 }]}
            >
              <View
                style={[
                  styles.tabChip,
                  isActive && styles.tabChipActive,
                  isDark && !isActive && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                  isDark && isActive && { backgroundColor: '#1E1B4B', borderColor: '#4A6CF7' },
                ]}
              >
                {isActive && <View style={styles.tabAccent} />}
                <Ionicons
                  name={t.icon}
                  size={14}
                  color={isActive ? '#4A6CF7' : (isDark ? colors.slate[400] : colors.slate[500])}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && styles.tabLabelActive,
                    isDark && !isActive && { color: colors.slate[400] },
                  ]}
                >
                  {t.label}
                </Text>
                <View
                  style={[
                    styles.tabCountBubble,
                    isActive && styles.tabCountBubbleActive,
                    isDark && !isActive && { backgroundColor: colors.dark.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      isActive && styles.tabCountTextActive,
                      isDark && !isActive && { color: colors.slate[400] },
                    ]}
                  >
                    {t.count}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </Animated.View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchContainer,
            isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
          ]}
        >
          <Ionicons
            name="search-outline"
            size={16}
            color={isDark ? colors.slate[400] : colors.slate[400]}
          />
          <TextInput
            style={[styles.searchInput, isDark && { color: colors.white }]}
            placeholder="Search by title, reference, or address..."
            placeholderTextColor={isDark ? colors.slate[500] : colors.slate[400]}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={isDark ? colors.slate[400] : colors.slate[400]} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Content */}
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
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderCard}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 16 },
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
          ItemSeparatorComponent={itemSeparator}
          ListEmptyComponent={listEmpty}
        />
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
    paddingBottom: 28,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  orb1: { width: 180, height: 180, top: -70, right: -50 },
  orb2: { width: 110, height: 110, bottom: 0, left: -30, backgroundColor: 'rgba(255,255,255,0.04)' },

  waveWrap: {
    height: 24,
    position: 'relative',
    marginTop: -1,
  },
  waveShape: {
    position: 'absolute',
    bottom: 0,
    left: -12,
    right: -12,
    height: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: 'transparent',
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    overflow: 'hidden',
  },
  tabChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  tabAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#4A6CF7',
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[500],
  },
  tabLabelActive: {
    color: '#4A6CF7',
    fontWeight: '700',
  },
  tabCountBubble: {
    backgroundColor: colors.slate[100],
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  tabCountBubbleActive: {
    backgroundColor: '#C7D2FE',
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[500],
  },
  tabCountTextActive: {
    color: '#4A6CF7',
  },

  /* Search */
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.slate[900],
    padding: 0,
  },

  /* List */
  list:      { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 16 },
  listEmpty: { flex: 1 },

  /* Card – compact horizontal layout */
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  severityBar: {
    width: 5,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardRow: {
    flex: 1,
    flexDirection: 'row',
  },

  /* Thumbnail */
  thumbWrap: {
    width: 88,
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
  },
  thumbImg: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  photoBadge: {
    position: 'absolute', bottom: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 10,
  },
  photoBadgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },

  cardBody: { flex: 1, padding: 10, gap: 6 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.slate[900],
    letterSpacing: 0.1,
  },
  chevronWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta:  { gap: 3 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:  { fontSize: 11, color: colors.slate[500], flex: 1 },
  cardChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingTop: 6,
    marginTop: 0,
  },
  cardRef:  { fontSize: 10, color: colors.slate[400], fontWeight: '600', letterSpacing: 0.2 },
  cardTime: { fontSize: 10, color: colors.slate[400] },

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
