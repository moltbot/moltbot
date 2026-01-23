import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Colors, Spacing } from '../theme/colors'
import { Message } from '../models/types'
import ToolCallView from './ToolCallView'

interface Props {
  message: Message
}

const MessageView: React.FC<Props> = ({ message }) => {
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set())

  const toggleToolCall = (id: string) => {
    setExpandedToolCalls((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <View style={styles.container}>
      {/* Message content */}
      {message.content && (
        <Text style={styles.messageContent}>{message.content}</Text>
      )}

      {/* Tool calls */}
      {message.toolCalls.map((toolCall) => (
        <ToolCallView
          key={toolCall.id}
          toolCall={toolCall}
          isExpanded={expandedToolCalls.has(toolCall.id)}
          onToggle={() => toggleToolCall(toolCall.id)}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.MD,
  },
  messageContent: {
    fontSize: 16,
    color: Colors.primaryText,
    paddingHorizontal: Spacing.LG,
  },
})

export default MessageView
