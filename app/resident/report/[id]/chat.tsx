/**
 * Report chat — resident messaging thread with responders / dispatch
 * Premium design · real-time polling · role-aware bubbles
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getReportMessages, sendReportMessage } from '@/services/api';
import type { IncidentMessage } from '@/types';

const POLL_INTERVAL = 10_000;

// ─── Animated bubble wrapper ────────────────────────────────────────────────

function AnimatedBubble({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Role badge ─────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const isResponder = role === 'responder';
  const isAdmin = role === 'admin';
  const color = isAdmin ? '#8B5CF6' : isResponder ? colors.accent[500] : colors.brand[500];
  const label = isAdmin ? 'Dispatch' : isResponder ? 'Responder' : 'You';

  return (
    <View style={[s.roleBadge, { backgroundColor: color + '18' }]}>
      <Ionicons
        name={isAdmin ? 'headset' : isResponder ? 'shield-checkmark' : 'person'}
        size={9}
        color={color}
      />
      <Text style={[s.roleBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function ResidentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<IncidentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';

  const loadMessages = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await getReportMessages(id, token!);
      setMessages(data);
    } catch {
      // Silently fail on poll
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    const interval = setInterval(() => loadMessages(true), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadMessages]);

  async function handleSend() {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      await sendReportMessage(id, msg, token!);
      setText('');
      await loadMessages(true);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      // Error handled silently
    } finally {
      setSending(false);
    }
  }

  const isMe = (msg: IncidentMessage) => msg.userId === user?.id;

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: screenBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={[s.headerBg, { backgroundColor: isDark ? colors.dark.surface : colors.brand[700] }]} />
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.headerTitle}>Messages</Text>
            <View style={s.onlineDot} />
          </View>
          <Text style={s.headerSub}>Chat with your assigned responder</Text>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={[s.messageList, { paddingBottom: 8 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <View style={[s.emptyIconWrap, isDark && { backgroundColor: colors.dark.card }]}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.brand[300]} />
              </View>
              <Text style={[s.emptyTitle, isDark && { color: colors.white }]}>No messages yet</Text>
              <Text style={[s.emptySub, isDark && { color: colors.slate[500] }]}>
                Send a message to communicate with the responder assigned to your report.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = isMe(item);
            return (
              <AnimatedBubble>
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                  {!mine && (
                    <View style={s.bubbleHeader}>
                      <Text style={[s.bubbleName, isDark && { color: colors.slate[400] }]}>
                        {item.userName}
                      </Text>
                      <RoleBadge role={item.userRole} />
                    </View>
                  )}
                  <View style={[
                    s.bubbleBody,
                    mine
                      ? { backgroundColor: colors.brand[500], borderBottomRightRadius: 4 }
                      : {
                          backgroundColor: isDark ? colors.dark.card : colors.white,
                          borderBottomLeftRadius: 4,
                          borderLeftWidth: 3,
                          borderLeftColor: item.userRole === 'admin' ? '#8B5CF6' : colors.accent[500],
                        },
                  ]}>
                    <Text style={[
                      s.bubbleText,
                      { color: mine ? colors.white : isDark ? colors.slate[200] : colors.slate[800] },
                    ]}>
                      {item.body}
                    </Text>
                  </View>
                  <Text style={[s.bubbleTime, isDark && { color: colors.slate[600] }]}>
                    {item.createdAt}
                  </Text>
                </View>
              </AnimatedBubble>
            );
          }}
        />
      )}

      {/* Input bar */}
      <View style={[
        s.inputBar,
        {
          paddingBottom: insets.bottom + 8,
          backgroundColor: isDark ? colors.dark.surface : colors.white,
          borderTopColor: isDark ? colors.dark.border : colors.slate[100],
        },
      ]}>
        <TextInput
          style={[
            s.input,
            isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border, color: colors.white },
          ]}
          placeholder="Type a message..."
          placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || sending}
          style={({ pressed }) => [
            s.sendBtn,
            (!text.trim() || sending) && { opacity: 0.4 },
            pressed && { transform: [{ scale: 0.9 }] },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={18} color={colors.white} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 20, zIndex: 10,
  },
  headerBg: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.severity.low },

  // Empty state
  emptyChat: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.brand[100],
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.slate[900] },
  emptySub: { fontSize: 13, color: colors.slate[400], textAlign: 'center', lineHeight: 20 },

  // Messages
  messageList: { padding: 16, gap: 14 },
  bubble: { maxWidth: '82%' },
  bubbleMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  bubbleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginLeft: 4 },
  bubbleName: { fontSize: 11, fontWeight: '700', color: colors.slate[500] },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  roleBadgeText: { fontSize: 9, fontWeight: '700' },

  bubbleBody: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  bubbleTime: { fontSize: 10, color: colors.slate[400], marginTop: 4, marginHorizontal: 4 },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 100,
    borderRadius: 22, borderWidth: 1.5, borderColor: colors.slate[200],
    backgroundColor: colors.slate[50], paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: colors.slate[900],
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand[500], shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
});
