import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useNetworkStatus } from '@/hooks/use-network-status';
import { getIncidentMessages, sendIncidentMessage, markMessagesRead, sendTypingEvent, getTypingUsers } from '@/services/api';
import type { IncidentMessage } from '@/types';

const QUICK_REPLIES = [
  'Need backup',
  'Road blocked, rerouting',
  'Requesting equipment',
  'Situation under control',
  'Evacuating residents',
  'Awaiting instructions',
];

const POLL_INTERVAL = 10_000;

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={s.typingRow}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View
          key={i}
          style={[
            s.typingDot,
            { opacity: d, transform: [{ scale: Animated.add(0.6, Animated.multiply(d, 0.4)) as unknown as number }] },
          ]}
        />
      ))}
    </View>
  );
}

function AnimatedBubble({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

export default function IncidentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user } = useAuth();
  const flatListRef = useRef<FlatList>(null);
  const isConnected = useNetworkStatus();

  const [messages, setMessages] = useState<IncidentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Array<{
    id: string;
    body: string;
    isQuickReply: boolean;
    status: 'sending' | 'failed';
  }>>([]);

  const [typingUsers, setTypingUsers] = useState<Array<{ name: string }>>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(async () => {
      try {
        const users = await getTypingUsers(id, token!);
        setTypingUsers(users);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [id, token, isConnected]);

  function handleTextChange(value: string) {
    setText(value);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value.trim()) {
      sendTypingEvent(id, token!);
      typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 3000);
    }
  }

  const loadMessages = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await getIncidentMessages(id, token!);
      setMessages(data);
      markMessagesRead(id, token!).catch(() => {});
    } catch (e: any) {
      if (!silent) Alert.alert('Load failed', `${e?.status ?? ''} ${e?.message ?? 'Could not load messages.'}`);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => loadMessages(true), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadMessages, isConnected]);

  async function handleSend(body?: string, quickReply = false) {
    const msg = body ?? text.trim();
    if (!msg) return;
    const tempId = `pending_${Date.now()}`;
    setText('');
    setShowQuickReplies(false);
    setPendingMessages(prev => [...prev, { id: tempId, body: msg, isQuickReply: quickReply, status: 'sending' }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      await sendIncidentMessage(id, msg, quickReply, token!);
      setPendingMessages(prev => prev.filter(m => m.id !== tempId));
      loadMessages(true);
    } catch (e: any) {
      Alert.alert('Send failed', `${e?.status ?? ''} ${e?.message ?? 'Could not send message.'}\n\nToken: ${token ? 'present' : 'MISSING'}`);
      setPendingMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  }

  async function handleRetry(tempId: string) {
    const msg = pendingMessages.find(m => m.id === tempId);
    if (!msg) return;
    setPendingMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sending' } : m));
    try {
      await sendIncidentMessage(id, msg.body, msg.isQuickReply, token!);
      setPendingMessages(prev => prev.filter(m => m.id !== tempId));
      loadMessages(true);
    } catch (e: any) {
      Alert.alert('Send failed', `${e?.status ?? ''} ${e?.message ?? 'Could not send message.'}`);

      setPendingMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  }

  const allMessages = [
    ...messages,
    ...pendingMessages.map(m => ({
      id: m.id,
      reportId: id,
      userId: user?.id ?? '',
      userName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
      userRole: 'responder',
      body: m.body,
      isQuickReply: m.isQuickReply,
      readAt: null,
      createdAt: m.status === 'failed' ? 'Failed to send' : 'Sending...',
    })),
  ];

  const isMe = (msg: IncidentMessage) => msg.userId === user?.id;

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: screenBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          s.headerBg,
          { paddingTop: insets.top + 8, backgroundColor: isDark ? colors.dark.surface : colors.accent[700] },
        ]}
      >
        <View style={s.headerContent}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={s.headerTitleRow}>
              <Text style={s.headerTitle}>Incident Chat</Text>
              <View style={s.onlineDot} />
            </View>
            <Text style={s.headerSub}>Communicate with dispatch</Text>
          </View>
          <Pressable onPress={() => setShowQuickReplies(v => !v)} style={s.quickBtn} hitSlop={8}>
            <Ionicons name="flash" size={18} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {showQuickReplies && (
        <View style={[s.quickReplies, isDark && { backgroundColor: colors.dark.card }]}>
          <Text style={[s.quickLabel, isDark && { color: colors.slate[400] }]}>Quick replies</Text>
          <View style={s.quickGrid}>
            {QUICK_REPLIES.map(qr => (
              <Pressable
                key={qr}
                onPress={() => handleSend(qr, true)}
                style={({ pressed }) => [
                  s.quickChip,
                  isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                  pressed && { transform: [{ scale: 0.95 }] },
                ]}
              >
                <Ionicons
                  name="flash"
                  size={11}
                  color={isDark ? colors.accent[500] : colors.accent[700]}
                  style={{ marginRight: 4 }}
                />
                <Text style={[s.quickChipText, isDark && { color: colors.slate[300] }]}>{qr}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!isConnected && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={14} color={colors.white} />
          <Text style={s.offlineBannerText}>You are offline</Text>
        </View>
      )}

      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={allMessages}
          keyExtractor={m => m.id}
          contentContainerStyle={[s.messageList, { paddingBottom: 8 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <View style={s.emptyIconBg}>
                <Ionicons name="chatbubbles-outline" size={64} color={colors.accent[500]} />
              </View>
              <Text style={[s.emptyChatTitle, isDark && { color: colors.slate[300] }]}>
                No messages yet
              </Text>
              <Text style={[s.emptyChatSub, isDark && { color: colors.slate[500] }]}>
                Messages with dispatch appear here
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = isMe(item);
            const pendingItem = pendingMessages.find(p => p.id === item.id);
            const isFailed = pendingItem?.status === 'failed';
            const isSending = pendingItem?.status === 'sending';
            return (
              <AnimatedBubble>
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                  {!mine && (
                    <Text style={[s.bubbleName, isDark && { color: colors.slate[400] }]}>
                      {item.userName} ({item.userRole})
                    </Text>
                  )}
                  <View
                    style={[
                      s.bubbleBody,
                      mine
                        ? [
                            s.bubbleBodyMine,
                            {
                              backgroundColor: isFailed ? colors.severity.critical : colors.accent[500],
                              borderBottomColor: isFailed ? colors.severity.critical : colors.accent[700],
                            },
                          ]
                        : [
                            s.bubbleBodyTheirs,
                            {
                              backgroundColor: isDark ? colors.dark.card : colors.white,
                              borderLeftColor: colors.accent[500],
                            },
                          ],
                    ]}
                  >
                    {item.isQuickReply && (
                      <Ionicons
                        name="flash"
                        size={12}
                        color={mine ? 'rgba(255,255,255,0.7)' : colors.accent[500]}
                        style={{ marginBottom: 2 }}
                      />
                    )}
                    <Text
                      style={[
                        s.bubbleText,
                        { color: mine ? colors.white : isDark ? colors.slate[200] : colors.slate[800] },
                      ]}
                    >
                      {item.body}
                    </Text>
                  </View>
                  {isFailed && (
                    <Pressable onPress={() => handleRetry(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginHorizontal: 4 }}>
                      <Ionicons name="refresh" size={12} color={colors.severity.critical} />
                      <Text style={{ fontSize: 11, color: colors.severity.critical, fontWeight: '600' }}>Tap to retry</Text>
                    </Pressable>
                  )}
                  {isSending && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, marginHorizontal: 4 }}>
                      <ActivityIndicator size={10} color={colors.slate[400]} />
                      <Text style={{ fontSize: 11, color: colors.slate[400] }}>Sending...</Text>
                    </View>
                  )}
                  {!isFailed && !isSending && (
                    <Text style={[s.bubbleTime, isDark && { color: colors.slate[600] }]}>
                      {item.createdAt}
                    </Text>
                  )}
                </View>
              </AnimatedBubble>
            );
          }}
        />
      )}

      <View
        style={[
          s.inputBar,
          {
            paddingBottom: insets.bottom + 8,
            backgroundColor: isDark ? colors.dark.surface : colors.white,
          },
        ]}
      >
        <View style={s.inputRow}>
          <TextInput
            style={[
              s.input,
              isDark && {
                backgroundColor: colors.dark.card,
                borderColor: colors.dark.border,
                color: colors.white,
              },
            ]}
            placeholder="Type a message..."
            placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={() => handleSend()}
            disabled={!text.trim()}
            style={({ pressed }) => [
              s.sendBtn,
              !text.trim() && { opacity: 0.4 },
              pressed && { transform: [{ scale: 0.9 }] },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.white} />
          </Pressable>
        </View>
        {typingUsers.length > 0 && (
          <View style={s.typingIndicator}>
            <TypingDots />
            <Text style={[s.typingText, isDark && { color: colors.slate[500] }]}>
              {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerBg: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    overflow: 'hidden',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  quickBtn: {
    width: 38,
    height: 38,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quickReplies: {
    padding: 14,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    borderRadius: 18,
    marginHorizontal: 8,
    marginTop: -8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  quickLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[400],
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  quickChipText: { fontSize: 12, fontWeight: '600', color: colors.slate[600] },

  messageList: { padding: 16, gap: 12 },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(15,168,150,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyChatTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.slate[700],
    textAlign: 'center',
  },
  emptyChatSub: {
    fontSize: 13,
    color: colors.slate[400],
    textAlign: 'center',
  },

  bubble: { maxWidth: '80%' },
  bubbleMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.slate[400],
    marginBottom: 3,
    marginLeft: 4,
  },
  bubbleBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bubbleBodyMine: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    borderBottomWidth: 1.5,
  },
  bubbleBodyTheirs: {
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderLeftWidth: 3,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTime: {
    fontSize: 10,
    color: colors.slate[400],
    marginTop: 3,
    marginHorizontal: 4,
  },

  inputBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.slate[900],
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent[500],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  typingText: {
    fontSize: 11,
    color: colors.slate[400],
    fontWeight: '500',
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 0,
    paddingBottom: 0,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent[500],
  },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.severity.critical,
    paddingVertical: 6,
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
});
