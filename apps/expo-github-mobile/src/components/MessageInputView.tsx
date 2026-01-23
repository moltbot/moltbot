import React from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'

interface Props {
  text: string
  placeholder: string
  onChangeText: (text: string) => void
  onSend: () => void
  disabled?: boolean
}

const MessageInputView: React.FC<Props> = ({ text, placeholder, onChangeText, onSend, disabled = false }) => {
  const isSendDisabled = disabled || !text.trim()

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.secondaryText}
          multiline
          maxLength={2000}
          editable={!disabled}
        />
        <TouchableOpacity
          style={[styles.sendButton, { opacity: isSendDisabled ? 0.5 : 1 }]}
          onPress={onSend}
          disabled={isSendDisabled}
        >
          <Ionicons name="arrow-up" size={20} color={Colors.buttonPrimaryText} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.MD,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.inputBackground,
    borderRadius: Radius.LG,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    gap: Spacing.SM,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.primaryText,
    maxHeight: 120,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.buttonPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default MessageInputView
