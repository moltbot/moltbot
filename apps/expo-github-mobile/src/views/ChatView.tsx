import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAppState } from '../contexts/AppContext'
import { Session, getFullName, Message, ToolCall, MessageRole, ToolCallStatus } from '../models/types'
import { Colors, Spacing, Radius } from '../theme/colors'
import MessageView from '../components/MessageView'
import MessageInputView from '../components/MessageInputView'
import Chip from '../components/Chip'
import { useGateway, type ToolCallEvent } from '../hooks/useGateway'

interface Props {
  session: Session
  onBack: () => void
}

// In-memory messages for this session (not persisted to AppContext)
const createMessage = (): Message => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  role: MessageRole.Assistant,
  content: '',
  timestamp: new Date(),
  toolCalls: [],
})

const ChatView: React.FC<Props> = ({ session, onBack }) => {
  const { sessions } = useAppState()
  const [messageText, setMessageText] = useState('')
  const [showCreatePR, setShowCreatePR] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingToolCalls, setPendingToolCalls] = useState<Map<string, ToolCall>>(new Map())
  const [isRunning, setIsRunning] = useState(false)

  const scrollViewRef = useRef<ScrollView>(null)

  // Get current session from state
  const currentSession = sessions.find((s) => s.id === session.id) || session

  // Gateway hooks
  const { connected: gatewayConnected, sendMessage: sendGatewayMessage, onToolCall, onAssistant, onLifecycle } = useGateway()

  // Handle tool call events
  useEffect(() => {
    const unsubscribe = onToolCall((event: ToolCallEvent) => {
      const { toolCallId, name, phase, args, partialResult, result, isError } = event

      setPendingToolCalls((prev) => {
        const next = new Map(prev)

        if (phase === 'start') {
          const toolCall: ToolCall = {
            id: toolCallId,
            type: name as any,
            name,
            input: JSON.stringify(args || {}),
            status: ToolCallStatus.Running,
          }
          next.set(toolCallId, toolCall)

          // Add to current assistant message
          setMessages((prevMsgs) => {
            const updated = [...prevMsgs]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg?.role === MessageRole.Assistant) {
              lastMsg.toolCalls = [...lastMsg.toolCalls, toolCall]
            }
            return updated
          })
        } else if (phase === 'update') {
          const existing = next.get(toolCallId)
          if (existing) {
            existing.output = partialResult || ''
          }
        } else if (phase === 'end') {
          const existing = next.get(toolCallId)
          if (existing) {
            existing.status = isError ? ToolCallStatus.Failed : ToolCallStatus.Completed
            existing.output = result ? JSON.stringify(result, null, 2) : existing.output
          }
        }

        return next
      })

      // Trigger scroll
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }, 50)
    })

    return unsubscribe
  }, [onToolCall])

  // Handle assistant events (text streaming)
  useEffect(() => {
    const unsubscribe = onAssistant((event) => {
      const { delta } = event

      setMessages((prev) => {
        const updated = [...prev]
        let lastMsg = updated[updated.length - 1]

        // Create new message if none exists or last is from user
        if (!lastMsg || lastMsg.role !== MessageRole.Assistant) {
          lastMsg = createMessage()
          updated.push(lastMsg)
        }

        if (delta) {
          lastMsg.content += delta
        }

        return updated
      })

      // Trigger scroll
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      }, 50)
    })

    return unsubscribe
  }, [onAssistant])

  // Handle lifecycle events
  useEffect(() => {
    const unsubscribe = onLifecycle((event) => {
      const { msg, phase } = event as { msg?: string; phase?: string }

      if (phase === 'start') {
        setIsRunning(true)
        // Create new assistant message for this run
        setMessages((prev) => [...prev, createMessage()])
      } else if (phase === 'end' || phase === 'error') {
        setIsRunning(false)
      }

      if (msg) {
        console.log('[Agent]', msg)
      }
    })

    return unsubscribe
  }, [onLifecycle])

  const handleSendMessage = async () => {
    if (!messageText.trim()) return

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: MessageRole.User,
      content: messageText,
      timestamp: new Date(),
      toolCalls: [],
    }

    setMessages((prev) => [...prev, userMsg])
    const textToSend = messageText
    setMessageText('')

    // Scroll to show user message
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true })
    }, 50)

    // Send to gateway
    const result = await sendGatewayMessage(textToSend, {
      owner: currentSession.repository.owner,
      name: currentSession.repository.name,
      branch: currentSession.repository.defaultBranch,
    })

    if (!result) {
      // Failed to send - show error
      setMessages((prev) => {
        const errorMsg: Message = {
          id: `msg-${Date.now()}-error`,
          role: MessageRole.Assistant,
          content: 'Failed to connect to clawdbot gateway. Please check your settings.',
          timestamp: new Date(),
          toolCalls: [],
        }
        return [...prev, errorMsg]
      })
    }
  }

  // Combine session messages with live messages
  const allMessages = [...currentSession.messages, ...messages]
  const hasToolCalls = allMessages.some((m) => m.toolCalls.length > 0)

  // Connection status indicator
  const connectionStatus = gatewayConnected ? 'Connected' : 'Disconnected'
  const connectionColor = gatewayConnected ? Colors.success : Colors.error

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentSession.title.length > 30
              ? currentSession.title.slice(0, 30) + '...'
              : currentSession.title}
          </Text>
          <View style={styles.headerSubtitleRow}>
            <Text style={styles.headerSubtitle}>
              {getFullName(currentSession.repository)} · {currentSession.repository.defaultBranch}
            </Text>
            {isRunning && (
              <ActivityIndicator size="small" color={Colors.accent} style={styles.spinner} />
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.menuButton}>
          <Ionicons name="ellipsis-horizontal-circle" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      {/* Connection status bar */}
      <View style={[styles.connectionBar, { backgroundColor: connectionColor + '20' }]}>
        <View style={[styles.connectionDot, { backgroundColor: connectionColor }]} />
        <Text style={[styles.connectionText, { color: connectionColor }]}>
          Gateway: {connectionStatus}
        </Text>
      </View>

      {/* Messages + Input with keyboard avoidance */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
        >
          {allMessages.map((message, index) => (
            <MessageView
              key={`${message.id}-${index}`}
              message={message}
            />
          ))}

          {/* Create PR button */}
          {hasToolCalls && (
            <View style={styles.prButtonContainer}>
              <Text style={styles.branchName} numberOfLines={1}>
                {currentSession.repository.owner}/{currentSession.repository.name}
              </Text>
              <TouchableOpacity style={styles.createPRButton} onPress={() => setShowCreatePR(true)}>
                <Text style={styles.createPRText}>Create PR</Text>
                <Ionicons name="open-outline" size={14} color={Colors.primaryText} />
                <Ionicons name="ellipsis-horizontal" size={14} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Input area */}
        <View style={styles.inputContainer}>
          <MessageInputView
            text={messageText}
            placeholder="Add feedback..."
            onChangeText={setMessageText}
            onSend={handleSendMessage}
            disabled={isRunning}
          />

          {/* Bottom chips */}
          <View style={styles.chipsContainer}>
            <Chip
              icon="code-working"
              text="Branch"
              secondaryText={currentSession.repository.defaultBranch}
            />
            {hasToolCalls && (
              <TouchableOpacity style={styles.createPRChip} onPress={() => setShowCreatePR(true)}>
                <Text style={styles.chipText}>Create PR</Text>
                <Ionicons name="open-outline" size={12} color={Colors.primaryText} />
                <Ionicons name="ellipsis-horizontal" size={12} color={Colors.primaryText} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
  },
  backButton: {
    width: 24,
    height: 24,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.SM,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primaryText,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSubtitle: {
    fontSize: 11,
    color: Colors.secondaryText,
  },
  spinner: {
    marginLeft: Spacing.XS,
  },
  menuButton: {
    width: 24,
    height: 24,
  },
  connectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.XS,
    gap: Spacing.XS,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '500',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  messagesContainer: {
    padding: Spacing.MD,
    gap: Spacing.LG,
  },
  prButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: Radius.MD,
    padding: Spacing.MD,
    marginTop: Spacing.SM,
  },
  branchName: {
    flex: 1,
    fontSize: 14,
    color: Colors.secondaryText,
  },
  createPRButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
  },
  createPRText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primaryText,
  },
  inputContainer: {
    backgroundColor: Colors.background,
    paddingBottom: Spacing.MD,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: Spacing.SM,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
  },
  createPRChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.MD,
  },
  chipText: {
    fontSize: 12,
    color: Colors.primaryText,
  },
})

export default ChatView
