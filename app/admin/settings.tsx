import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as Storage from '@/utils/storage';

export const ADMIN_AUTO_PROCESS_KEY = 'admin_auto_process';

export default function AdminSettings() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const router = useRouter();

  const [autoProcess, setAutoProcess]   = useState(false);
  const [loadingSetting, setLoadingSetting] = useState(true);

  const bg            = isDark ? colors.dark.bg      : '#F2F4F7';
  const cardBg        = isDark ? colors.dark.card    : colors.white;
  const cardBorder    = isDark ? colors.dark.border  : '#E8ECF0';
  const textPrimary   = isDark ? colors.white        : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400]   : colors.slate[500];

  useEffect(() => {
    Storage.getItem(ADMIN_AUTO_PROCESS_KEY).then(val => {
      setAutoProcess(val === '1');
      setLoadingSetting(false);
    });
  }, []);

  async function handleToggleAutoProcess(value: boolean) {
    setAutoProcess(value);
    await Storage.setItem(ADMIN_AUTO_PROCESS_KEY, value ? '1' : '0');
  }

  return (
    <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={$.header}>
          <Pressable onPress={() => router.back()} style={[$.backBtn, { borderColor: cardBorder }]}>
            <Ionicons name="arrow-back" size={18} color={textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[$.headerTitle, { color: textPrimary }]}>Settings</Text>
            <Text style={[$.headerSub, { color: textSecondary }]}>Admin preferences</Text>
          </View>
        </View>

        {/* AI Report Processing section */}
        <Text style={[$.sectionLabel, { color: textSecondary }]}>AI Report Processing</Text>

        <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Auto Process toggle */}
          <View style={$.settingRow}>
            <View style={[$.settingIcon, { backgroundColor: colors.brand[500] + '15' }]}>
              <Ionicons name="sparkles" size={18} color={colors.brand[500]} />
            </View>
            <View style={$.settingInfo}>
              <Text style={[$.settingTitle, { color: textPrimary }]}>Auto Process Reports</Text>
              <Text style={[$.settingDesc, { color: textSecondary }]}>
                Automatically verify or reject reports based on AI image analysis when you open Report Management
              </Text>
            </View>
            {loadingSetting ? (
              <ActivityIndicator size="small" color={colors.brand[500]} />
            ) : (
              <Switch
                value={autoProcess}
                onValueChange={handleToggleAutoProcess}
                trackColor={{ false: isDark ? colors.slate[700] : colors.slate[200], true: colors.brand[500] }}
                thumbColor={colors.white}
              />
            )}
          </View>

          {/* Divider */}
          <View style={[$.divider, { backgroundColor: cardBorder }]} />

          {/* How it works explanation */}
          <View style={$.howItWorks}>
            <Text style={[$.howTitle, { color: textPrimary }]}>How it works</Text>

            <View style={$.howRow}>
              <View style={[$.howDot, { backgroundColor: colors.severity.low }]} />
              <Text style={[$.howText, { color: textSecondary }]}>
                <Text style={{ fontWeight: '700', color: textPrimary }}>Auto-Verify: </Text>
                AI confirmed flood in photo, no flags, not a duplicate
              </Text>
            </View>

            <View style={$.howRow}>
              <View style={[$.howDot, { backgroundColor: colors.severity.critical }]} />
              <Text style={[$.howText, { color: textSecondary }]}>
                <Text style={{ fontWeight: '700', color: textPrimary }}>Auto-Reject: </Text>
                AI found no flood in the submitted photo
              </Text>
            </View>

            <View style={$.howRow}>
              <View style={[$.howDot, { backgroundColor: colors.severity.moderate }]} />
              <Text style={[$.howText, { color: textSecondary }]}>
                <Text style={{ fontWeight: '700', color: textPrimary }}>Manual Review: </Text>
                Duplicates, suspicious reports, or no AI verdict yet — always require your decision
              </Text>
            </View>
          </View>
        </View>

        {/* Status banner */}
        <View style={[
          $.statusBanner,
          {
            backgroundColor: autoProcess ? colors.brand[500] + '10' : colors.slate[400] + '10',
            borderColor:     autoProcess ? colors.brand[500] + '30' : colors.slate[400] + '30',
          },
        ]}>
          <Ionicons
            name={autoProcess ? 'checkmark-circle' : 'pause-circle'}
            size={16}
            color={autoProcess ? colors.brand[500] : textSecondary}
          />
          <Text style={[$.statusText, { color: autoProcess ? colors.brand[500] : textSecondary }]}>
            {autoProcess
              ? 'Auto processing is ON — AI will approve/reject clear cases automatically'
              : 'Auto processing is OFF — all reports require manual review'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const $ = StyleSheet.create({
  root:    { flex: 1 },

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

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },

  card: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingInfo: { flex: 1, gap: 3 },
  settingTitle: { fontSize: 15, fontWeight: '700' },
  settingDesc:  { fontSize: 12, fontWeight: '500', lineHeight: 17 },

  divider: { height: 1, marginHorizontal: 16 },

  howItWorks: {
    padding: 16,
    gap: 10,
  },
  howTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  howRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  howDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
  howText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 18 },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
});
