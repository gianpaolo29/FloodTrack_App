import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useNetworkStatus } from '@/hooks/use-network-status';
import {
  getIncidentMessages,
  sendIncidentMessage,
  markIncidentMessagesRead,
  getIncidentDetail,
} from '@/services/api';
import {
  socketService,
  adaptSocketMessage,
  type RawSocketMessage,
  type TypingUser,
} from '@/services/socket';
import type { IncidentMessage } from '@/types';

const QUICK_REPLIES = [
  'Need backup',
  'Road blocked, rerouting',
  'Requesting equipment',
  'Situation under control',
  'Evacuating residents',
  'Awaiting instructions',
];

const HEADER_GRADIENT = ['#1F6FBF', '#124577', '#0B2F52'] as const;

// ─── TypingDots ───────────────────────────────────────────────────────────────
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
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={s.typingDotRow}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View
          key={i}
          style={[
            s.typingDot,
            {
              opacity: d,
              transform: [{ scale: Animated.add(0.6, Animated.multiply(d, 0.4)) as unknown as number }],
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── AnimatedBubble ───────────────────────────────────────────────────────────
function AnimatedBubble({ children }: { children: React.ReactNode }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── RoleBadge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const isAdmin     = role === 'admin';
  const isResponder = role === 'responder';
  const color = isAdmin ? colors.iconAccents.admin : colors.brand[500];
  const label = isAdmin ? 'Dispatch' : isResponder ? 'Responder' : 'Resident';
  const icon: keyof typeof Ionicons.glyphMap = isAdmin ? 'headset' : isResponder ? 'shield-checkmark' : 'person';

  return (
    <View style={[s.roleBadge, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={9} color={color} />
      <Text style={[s.roleBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function IncidentChatScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scheme    = useColorScheme();
  const isDark    = scheme === 'dark';
  const { token, user } = useAuth();
  const flatListRef  = useRef<FlatList>(null);
  const isConnected  = useNetworkStatus();

  const [messages, setMessages]               = useState<IncidentMessage[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [text, setText]                       = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Array<{
    id: string;
    body: string;
    isQuickReply: boolean;
    status: 'sending' | 'failed';
  }>>([]);

  const [loadError, setLoadError]             = useState<string | null>(null);
  const [typingUsers, setTypingUsers]         = useState<TypingUser[]>([]);
  const [incidentStatus, setIncidentStatus]   = useState<string | null>(null);
  const [incidentTitle, setIncidentTitle]     = useState('');
  const [incidentRef, setIncidentRef]         = useState('');
  const [isAssigned, setIsAssigned]           = useState<boolean | null>(null);

  const typingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const isChatClosed  = incidentStatus === 'resolved';
  const isChatBlocked = isAssigned === false;
  const screenBg      = isDark ? colors.dark.bg : '#F4F6F9';

  // ── Load incident metadata ──
  useEffect(() => {
    if (!token || !user) return;
    getIncidentDetail(id, token)
      .then(detail => {
        setIncidentStatus(detail.responderStatus);
        setIncidentTitle(detail.title);
        setIncidentRef(detail.reference);
        const members = detail.memberStatuses ?? [];
        const onAssignedTeam = !!detail.teamId && detail.teamId === user.teamId;
        setIsAssigned(
          members.length === 0 ||
          members.some(m => m.userId === user.id) ||
          onAssignedTeam ||
          user.isLeader === true,
        );
      })
      .catch(() => {});
  }, [id, token, user]);

  // ── Socket setup ──
  useEffect(() => {
    if (!token || !user) return;
    socketService.connect(token);
    socketService.joinReport(id);

    const handleStatusChange = (data: { reportId: string }) => {
      if (data.reportId === id && token) {
        getIncidentDetail(id, token)
          .then(detail => setIncidentStatus(detail.responderStatus))
          .catch(() => {});
      }
    };

    const handleNewMessage = (raw: RawSocketMessage) => {
      const msg = adaptSocketMessage(raw, id);
      if (msg.userId === user.id) return;
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      markIncidentMessagesRead(id, token).catch(() => {});
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const handleTypingUpdate = (data: TypingUser) => {
      if (String(data.id) === user.id) return;
      const key = String(data.id);
      const old = typingClearTimers.current.get(key);
      if (old) clearTimeout(old);
      setTypingUsers(prev => [...prev.filter(u => String(u.id) !== key), data]);
      const timer = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => String(u.id) !== key));
        typingClearTimers.current.delete(key);
      }, 4000);
      typingClearTimers.current.set(key, timer);
    };

    const handleMessagesRead = (data: { reportId: string }) => {
      if (data.reportId === id) loadMessages(true);
    };

    socketService.on<RawSocketMessage>('new-message', handleNewMessage);
    socketService.on<TypingUser>('typing-update', handleTypingUpdate);
    socketService.on<{ reportId: string }>('report-status', handleStatusChange);
    socketService.on<{ reportId: string }>('messages-read', handleMessagesRead);

    return () => {
      socketService.leaveReport(id);
      socketService.off<RawSocketMessage>('new-message', handleNewMessage);
      socketService.off<TypingUser>('typing-update', handleTypingUpdate);
      socketService.off<{ reportId: string }>('report-status', handleStatusChange);
      socketService.off<{ reportId: string }>('messages-read', handleMessagesRead);
      typingClearTimers.current.forEach(t => clearTimeout(t));
      typingClearTimers.current.clear();
    };
  }, [id, token, user]);

  // ── Typing emit ──
  function handleTextChange(value: string) {
    setText(value);
    if (!value.trim() || typingTimerRef.current) return;
    socketService.emitTyping(id);
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 2000);
  }

  // ── Load messages ──
  const loadMessages = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);
      if (!silent) setLoadError(null);
      const data = await getIncidentMessages(id, token);
      setMessages(data);
      markIncidentMessagesRead(id, token).catch(() => {});
    } catch (e: any) {
      if (!silent) {
        const status = e?.response?.status;
        if (status === 401 || status === 403) {
          setLoadError('You are not authorized to view this chat.');
        } else {
          setLoadError('Could not load messages. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── Send ──
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
      setPendingMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  }

  // ── Retry ──
  async function handleRetry(tempId: string) {
    const msg = pendingMessages.find(m => m.id === tempId);
    if (!msg) return;
    setPendingMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'sending' } : m));
    try {
      await sendIncidentMessage(id, msg.body, msg.isQuickReply, token!);
      setPendingMessages(prev => prev.filter(m => m.id !== tempId));
      loadMessages(true);
    } catch {
      setPendingMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m));
    }
  }

  const allMessages = [
    ...messages,
    ...pendingMessages.map(m => ({
      id:           m.id,
      reportId:     id,
      userId:       user?.id ?? '',
      userName:     `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
      userRole:     'responder',
      body:         m.body,
      isQuickReply: m.isQuickReply,
      readAt:       null,
      createdAt:    m.status === 'failed' ? 'Failed to send' : 'Sending…',
    })),
  ];

  const isMe = (msg: IncidentMessage) => msg.userId === user?.id;

  // Last outgoing message that the other side has read
  const lastSeenId = [...allMessages]
    .reverse()
    .find(m => isMe(m) && m.readAt !== null && !pendingMessages.find(p => p.id === m.id))
    ?.id ?? null;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: screenBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={HEADER_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={s.headerOverlay} />

        <Pressable
          onPress={() => router.back()}
          style={s.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={colors.white} />
        </Pressable>

        <View style={{ flex: 1 }}>
          {incidentRef !== '' && (
            <Text style={s.headerRef}>{incidentRef}</Text>
          )}
          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>Incident Chat</Text>
            {isConnected && !isChatClosed && !isChatBlocked && (
              <View style={s.onlineDot} />
            )}
          </View>
          {incidentTitle !== '' && (
            <Text style={s.headerSub} numberOfLines={1}>{incidentTitle}</Text>
          )}
        </View>

        <View style={s.headerActions}>
          {isChatClosed ? (
            <View style={s.resolvedPill}>
              <Ionicons name="checkmark-circle" size={12} color={colors.white} />
              <Text style={s.resolvedPillText}>Resolved</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setShowQuickReplies(v => !v)}
              style={[s.quickToggleBtn, showQuickReplies && s.quickToggleBtnActive]}
              accessibilityRole="button"
              accessibilityLabel="Quick replies"
              hitSlop={8}
            >
              <Ionicons name="flash" size={17} color={colors.white} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {/* ── Quick replies tray ── */}
      {showQuickReplies && !isChatClosed && !isChatBlocked && (
        <View style={[s.quickTray, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
          <View style={s.quickTrayHeader}>
            <Ionicons name="flash" size={13} color={colors.brand[500]} />
            <Text style={[s.quickTrayLabel, isDark && { color: colors.slate[400] }]}>Quick replies</Text>
            <Pressable
              onPress={() => setShowQuickReplies(false)}
              style={s.quickTrayClose}
              hitSlop={6}
            >
              <Ionicons name="close" size={16} color={isDark ? colors.slate[500] : colors.slate[400]} />
            </Pressable>
          </View>
          <View style={s.quickGrid}>
            {QUICK_REPLIES.map(qr => (
              <Pressable
                key={qr}
                onPress={() => handleSend(qr, true)}
                style={({ pressed }) => [
                  s.quickChip,
                  isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                  pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 },
                ]}
              >
                <Text style={[s.quickChipText, isDark && { color: colors.slate[300] }]}>{qr}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ── Offline banner ── */}
      {!isConnected && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline" size={13} color={colors.white} />
          <Text style={s.offlineBannerText}>You are offline — messages may not deliver</Text>
        </View>
      )}

      {/* ── Message list ── */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      ) : loadError ? (
        <View style={s.centered}>
          <View style={[s.emptyIconBg, isDark && { backgroundColor: colors.dark.card }]}>
            <Ionicons name="lock-closed-outline" size={32} color={colors.slate[400]} />
          </View>
          <Text style={[s.emptyTitle, isDark && { color: colors.white }]}>Chat Unavailable</Text>
          <Text style={[s.emptySub, isDark && { color: colors.slate[500] }]}>{loadError}</Text>
          <Pressable
            onPress={() => loadMessages()}
            style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={14} color={colors.white} />
            <Text style={s.retryBtnText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={allMessages}
          keyExtractor={m => m.id}
          contentContainerStyle={[s.messageList, { paddingBottom: 8 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <View style={[s.emptyIconBg, isDark && { backgroundColor: colors.dark.card }]}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.brand[300]} />
              </View>
              <Text style={[s.emptyTitle, isDark && { color: colors.white }]}>
                No messages yet
              </Text>
              <Text style={[s.emptySub, isDark && { color: colors.slate[500] }]}>
                Use the chat to coordinate with dispatch and team members.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine        = isMe(item);
            const pendingItem = pendingMessages.find(p => p.id === item.id);
            const isFailed    = pendingItem?.status === 'failed';
            const isSending   = pendingItem?.status === 'sending';
            const isSeen      = item.id === lastSeenId;
            const senderColor = item.userRole === 'admin' ? colors.iconAccents.admin : colors.brand[500];

            return (
              <AnimatedBubble>
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>

                  {/* Sender name + badge */}
                  {!mine && (
                    <View style={s.bubbleMeta}>
                      <Text style={[s.bubbleName, isDark && { color: colors.slate[400] }]}>
                        {item.userName}
                      </Text>
                      <RoleBadge role={item.userRole} />
                    </View>
                  )}

                  {/* Bubble body */}
                  <View style={[
                    s.bubbleBody,
                    mine
                      ? {
                          backgroundColor: isFailed ? colors.severity.critical : colors.brand[500],
                          borderBottomRightRadius: 4,
                        }
                      : {
                          backgroundColor: isDark ? colors.dark.card : colors.white,
                          borderBottomLeftRadius: 4,
                          borderLeftWidth: 3,
                          borderLeftColor: senderColor,
                        },
                  ]}>
                    {item.isQuickReply && (
                      <View style={s.quickReplyTag}>
                        <Ionicons
                          name="flash"
                          size={10}
                          color={mine ? 'rgba(255,255,255,0.75)' : colors.brand[500]}
                        />
                        <Text style={[
                          s.quickReplyTagText,
                          { color: mine ? 'rgba(255,255,255,0.75)' : colors.brand[500] },
                        ]}>
                          Quick reply
                        </Text>
                      </View>
                    )}
                    <Text style={[
                      s.bubbleText,
                      { color: mine ? colors.white : isDark ? colors.slate[200] : colors.slate[800] },
                    ]}>
                      {item.body}
                    </Text>
                  </View>

                  {/* Status row */}
                  {isFailed && (
                    <Pressable onPress={() => handleRetry(item.id)} style={s.retryRow}>
                      <Ionicons name="refresh" size={11} color={colors.severity.critical} />
                      <Text style={s.retryText}>Tap to retry</Text>
                    </Pressable>
                  )}
                  {isSending && (
                    <View style={s.sendingRow}>
                      <ActivityIndicator size={10} color={colors.slate[400]} />
                      <Text style={[s.sendingText, isDark && { color: colors.slate[600] }]}>Sending…</Text>
                    </View>
                  )}
                  {!isFailed && !isSending && (
                    <View style={[s.bubbleFooter, mine && s.bubbleFooterMine]}>
                      <Text style={[s.bubbleTime, isDark && { color: colors.slate[600] }]}>
                        {item.createdAt}
                      </Text>
                      {mine && !isSeen && (
                        <Ionicons name="checkmark-done" size={13} color={isDark ? colors.slate[600] : colors.slate[300]} />
                      )}
                      {mine && isSeen && (
                        <View style={s.seenRow}>
                          <Ionicons name="checkmark-done" size={13} color={colors.brand[500]} />
                          <Text style={s.seenText}>Seen</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </AnimatedBubble>
            );
          }}
        />
      )}

      {/* ── Input bar / closed banner ── */}
      {isChatClosed || isChatBlocked ? (
        <View style={[
          s.closedBanner,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: isDark ? colors.dark.surface : colors.white,
            borderTopColor: isDark ? colors.dark.border : colors.slate[100],
          },
        ]}>
          <View style={[s.closedInner, isDark && { backgroundColor: colors.dark.elevated }]}>
            <Ionicons
              name={isChatBlocked ? 'lock-closed' : 'checkmark-circle'}
              size={18}
              color={isChatBlocked ? colors.slate[400] : colors.severity.low}
            />
            <Text style={[s.closedText, isDark && { color: colors.slate[400] }]}>
              {isChatBlocked
                ? 'Only assigned team members can send messages'
                : 'Incident resolved — chat is now closed'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[
          s.inputBar,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: isDark ? colors.dark.surface : colors.white,
            borderTopColor: isDark ? colors.dark.border : colors.slate[100],
          },
        ]}>
          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <View style={s.typingIndicator}>
              <TypingDots />
              <Text style={[s.typingText, isDark && { color: colors.slate[500] }]}>
                {typingUsers.map(u => u.name).join(', ')}
                {' '}{typingUsers.length === 1 ? 'is' : 'are'} typing
              </Text>
            </View>
          )}

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
              placeholder="Type a message…"
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
                !text.trim() && { opacity: 0.4, backgroundColor: colors.slate[400] },
                pressed && { transform: [{ scale: 0.9 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={17} color={colors.white} />
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Header ──
  header: {
    zIndex: 10,
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingBottom: 18, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 14, elevation: 12,
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 2,
  },
  headerRef:      { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 0.4 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle:    { fontSize: 17, fontWeight: '800', color: colors.white },
  onlineDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  headerSub:      { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  headerActions:  { paddingTop: 4 },

  resolvedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  resolvedPillText: { fontSize: 11, fontWeight: '700', color: colors.white },

  quickToggleBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  quickToggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderColor: 'rgba(255,255,255,0.4)',
  },

  // ── Quick replies tray ──
  quickTray: {
    marginHorizontal: 12, marginTop: 6,
    borderRadius: 16, padding: 14,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.slate[100],
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 4,
  },
  quickTrayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10,
  },
  quickTrayLabel: {
    flex: 1, fontSize: 11, fontWeight: '700',
    color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 0.5,
  },
  quickTrayClose: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.brand[500] + '0E',
    borderWidth: 1, borderColor: colors.brand[500] + '30',
  },
  quickChipText: { fontSize: 12, fontWeight: '600', color: colors.brand[500] },

  // ── Offline banner ──
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.severity.critical, paddingVertical: 7,
  },
  offlineBannerText: { fontSize: 12, fontWeight: '700', color: colors.white },

  // ── Message list ──
  messageList: { padding: 16, gap: 12 },

  emptyState:  { alignItems: 'center', paddingTop: 72, paddingHorizontal: 40, gap: 12 },
  emptyIconBg: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.brand[500] + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.slate[900] },
  emptySub:   { fontSize: 13, color: colors.slate[400], textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20, backgroundColor: colors.brand[500],
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  // ── Bubbles ──
  bubble:       { maxWidth: '82%' },
  bubbleMine:   { alignSelf: 'flex-end',   alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  bubbleMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 4, marginLeft: 4,
  },
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
  quickReplyTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginBottom: 5,
  },
  quickReplyTagText: { fontSize: 10, fontWeight: '700' },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  bubbleTime: { fontSize: 10, color: colors.slate[400] },

  retryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 3, marginHorizontal: 4,
  },
  retryText:   { fontSize: 11, color: colors.severity.critical, fontWeight: '600' },
  sendingRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, marginHorizontal: 4 },
  sendingText: { fontSize: 11, color: colors.slate[400] },
  bubbleFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 4, marginHorizontal: 4,
  },
  bubbleFooterMine: { justifyContent: 'flex-end' },
  seenRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seenText: { fontSize: 10, color: colors.brand[500], fontWeight: '700' },

  // ── Input bar ──
  inputBar: {
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  typingIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingBottom: 8, paddingHorizontal: 4,
  },
  typingText: { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  typingDotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  typingDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: colors.brand[500],
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1, minHeight: 44, maxHeight: 100,
    borderRadius: 22, borderWidth: 1.5, borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: colors.slate[900],
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },

  // ── Closed banner ──
  closedBanner: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 8,
  },
  closedInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: colors.severity.low + '0C',
  },
  closedText: { fontSize: 13, fontWeight: '600', color: colors.slate[500] },
});
