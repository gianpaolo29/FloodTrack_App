import { useEffect, useRef } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface Contact {
  name: string;
  number: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ContactGroup {
  title: string;
  color: string;
  contacts: Contact[];
}

const CONTACT_GROUPS: ContactGroup[] = [
  {
    title: 'Emergency Hotlines',
    color: colors.severity.critical,
    contacts: [
      { name: 'National Emergency (911)', number: '911', icon: 'call' },
      { name: 'NDRRMC Operations', number: '8911-5061', icon: 'shield' },
      { name: 'Philippine Red Cross', number: '143', icon: 'medkit' },
    ],
  },
  {
    title: 'Rescue Services',
    color: '#3B82F6',
    contacts: [
      { name: 'Bureau of Fire Protection', number: '8426-0219', icon: 'flame' },
      { name: 'Philippine Coast Guard', number: '8527-8481', icon: 'boat' },
      { name: 'PNP Emergency', number: '117', icon: 'shield-checkmark' },
    ],
  },
  {
    title: 'Medical',
    color: colors.severity.low,
    contacts: [
      { name: 'DOH Hotline', number: '1555', icon: 'medical' },
      { name: 'Poison Control', number: '8524-1078', icon: 'warning' },
    ],
  },
  {
    title: 'Utilities',
    color: '#F59E0B',
    contacts: [
      { name: 'Meralco (Power)', number: '16211', icon: 'flash' },
      { name: 'Maynilad (Water)', number: '1626', icon: 'water' },
      { name: 'MMDA Metrobase', number: '136', icon: 'car' },
    ],
  },
  {
    title: 'Weather & Monitoring',
    color: '#8B5CF6',
    contacts: [
      { name: 'PAGASA Weather', number: '8284-0800', icon: 'cloudy' },
      { name: 'PHIVOLCS', number: '8426-1468', icon: 'pulse' },
    ],
  },
];

export default function ContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg = isDark ? colors.dark.card : colors.white;

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  function call(number: string) {
    Linking.openURL(`tel:${number}`);
  }

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>
      <View
        style={[
          s.headerBg,
          {
            paddingTop: insets.top + 8,
            backgroundColor: isDark ? colors.dark.surface : colors.accent[700],
          },
        ]}
      >
        <View style={s.headerContent}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Emergency Contacts</Text>
            <Text style={s.headerSub}>Quick-dial directory</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => call('911')}
          style={({ pressed }) => [
            s.emergBanner,
            pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Animated.View
            style={[s.emergIcon, { transform: [{ scale: pulseAnim }] }]}
          >
            <Ionicons name="call" size={24} color={colors.white} />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={s.emergTitle}>Emergency? Call 911</Text>
            <Text style={s.emergSub}>
              For life-threatening situations, call immediately
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color="rgba(255,255,255,0.6)"
          />
        </Pressable>

        {CONTACT_GROUPS.map((group) => (
          <View key={group.title}>
            <View style={s.groupTitleRow}>
              <Text style={[s.groupTitle, isDark && { color: colors.slate[400] }]}>
                {group.title}
              </Text>
              <View
                style={[
                  s.countBadge,
                  { backgroundColor: group.color + '20' },
                ]}
              >
                <Text style={[s.countBadgeText, { color: group.color }]}>
                  {group.contacts.length}
                </Text>
              </View>
            </View>

            <View style={[s.card, { backgroundColor: cardBg }]}>
              {group.contacts.map((contact, idx) => (
                <Pressable
                  key={contact.name}
                  onPress={() => call(contact.number)}
                  style={({ pressed }) => [
                    s.contactRow,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <View
                    style={[
                      s.contactIcon,
                      { backgroundColor: group.color + '18' },
                    ]}
                  >
                    <Ionicons name={contact.icon} size={20} color={group.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={[
                        s.contactName,
                        isDark && { color: colors.white },
                      ]}
                    >
                      {contact.name}
                    </Text>
                    <Text
                      style={[
                        s.contactNumber,
                        isDark && { color: colors.slate[400] },
                      ]}
                    >
                      {contact.number}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.callBtn,
                      {
                        backgroundColor: group.color + '18',
                        borderColor: group.color + '4D',
                        shadowColor: group.color,
                      },
                    ]}
                  >
                    <Ionicons name="call" size={17} color={group.color} />
                  </View>
                  {idx !== group.contacts.length - 1 && (
                    <View
                      style={[
                        s.divider,
                        isDark && { backgroundColor: colors.dark.border },
                      ]}
                    />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  headerBg: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  scroll: { padding: 16, gap: 6 },

  emergBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.severity.critical,
    borderRadius: 18,
    padding: 18,
    marginBottom: 8,
    shadowColor: colors.severity.critical,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  emergIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  emergSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },

  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    marginTop: 14,
    marginBottom: 7,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[400],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },

  card: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: 'relative',
  },
  contactIcon: {
    width: 42,
    height: 42,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
  },
  contactNumber: { fontSize: 12, color: colors.slate[400] },

  callBtn: {
    width: 42,
    height: 42,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },

  divider: {
    position: 'absolute',
    bottom: 0,
    left: 70,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.slate[100],
  },
});
