import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAppState, Session } from '../contexts/AppContext'
import { Colors, Spacing, Radius } from '../theme/colors'
import SessionRow from '../components/SessionRow'
import NewSessionSheet from '../components/NewSessionSheet'

interface Props {
  onSessionPress: (session: Session) => void
  onSettingsPress: () => void
}

const SessionListView: React.FC<Props> = ({ onSessionPress, onSettingsPress }) => {
  const { sessions } = useAppState()
  const [showNewSessionSheet, setShowNewSessionSheet] = useState(false)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuButton} onPress={onSettingsPress}>
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Code</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Status indicator */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>Idle</Text>
      </View>

      {/* Session list */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onPress={() => {
              onSessionPress(session)
            }}
          />
        ))}
      </ScrollView>

      {/* New session button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.newSessionButton}
          onPress={() => setShowNewSessionSheet(true)}
        >
          <Text style={styles.newSessionButtonText}>New session</Text>
        </TouchableOpacity>
      </View>

      {/* New session sheet */}
      <NewSessionSheet
        visible={showNewSessionSheet}
        onClose={() => setShowNewSessionSheet(false)}
        onSessionCreate={(session) => {
          setShowNewSessionSheet(false)
          onSessionPress(session)
        }}
      />
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
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.SM,
  },
  menuButton: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  statusContainer: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.SM,
  },
  statusText: {
    fontSize: 13,
    color: Colors.secondaryText,
  },
  scrollView: {
    flex: 1,
  },
  footer: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
  },
  newSessionButton: {
    backgroundColor: Colors.buttonPrimary,
    borderRadius: Radius.Full,
    paddingVertical: Spacing.MD,
    alignItems: 'center',
  },
  newSessionButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.buttonPrimaryText,
  },
})

export default SessionListView
