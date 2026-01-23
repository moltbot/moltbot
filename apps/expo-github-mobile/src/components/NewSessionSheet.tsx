import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Spacing, Radius } from '../theme/colors'
import { useAppState } from '../contexts/AppContext'
import {
  Repository,
  Session,
  AIModel,
  AIModels,
  allModels,
} from '../models/types'
import MessageInputView from './MessageInputView'
import { useGitHubRepos, type GitHubRepo, type GitHubBranch } from '../hooks/useGitHub'
import { useSettings } from '../hooks/useSettings'
import { GitHubAPI } from '../services/github'

interface Props {
  visible: boolean
  onClose: () => void
  onSessionCreate: (session: Session) => void
}

const NewSessionSheet: React.FC<Props> = ({ visible, onClose, onSessionCreate }) => {
  const { createNewSession, sendMessage } = useAppState()
  const { settings } = useSettings()
  const { repos, loading: loadingRepos, error: reposError, refetch } = useGitHubRepos()

  const [messageText, setMessageText] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | undefined>()
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<AIModel>(AIModels.sonnet)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showRepoPicker, setShowRepoPicker] = useState(false)
  const [showBranchPicker, setShowBranchPicker] = useState(false)

  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  // Set initial repo when repos load
  useEffect(() => {
    if (visible && repos.length > 0 && !selectedRepo) {
      setSelectedRepo(repos[0])
      setSelectedBranch(repos[0].default_branch)
    }
  }, [visible, repos])

  // Fetch branches when repo changes
  useEffect(() => {
    if (!selectedRepo) return

    const fetchBranches = async () => {
      setLoadingBranches(true)
      try {
        const b = await GitHubAPI.getRepoBranches(selectedRepo.owner.login, selectedRepo.name)
        setBranches(b)
        if (!selectedBranch && b.length > 0) {
          setSelectedBranch(selectedRepo.default_branch || b[0].name)
        }
      } catch (e) {
        console.error('Failed to fetch branches', e)
      } finally {
        setLoadingBranches(false)
      }
    }

    fetchBranches()
  }, [selectedRepo])

  const handleCreateSession = () => {
    if (!messageText.trim() || !selectedRepo) return

    // Convert GitHubRepo to app Repository
    const repository: Repository = {
      id: String(selectedRepo.id),
      name: selectedRepo.name,
      owner: selectedRepo.owner.login,
      defaultBranch: selectedRepo.default_branch,
      language: selectedRepo.language || undefined,
    }

    const session = createNewSession(messageText.slice(0, 50), repository)
    sendMessage(messageText, session)
    setMessageText('')
    onSessionCreate(session)
  }

  const showNoUsername = !settings.githubUsername && !loadingRepos

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Session</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Content with keyboard avoidance */}
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {showNoUsername ? (
            <View style={styles.emptyState}>
              <Ionicons name="logo-github" size={64} color={Colors.tertiaryText} />
              <Text style={styles.emptyTitle}>GitHub Username Required</Text>
              <Text style={styles.emptyText}>
                Please set your GitHub username in Settings to fetch repositories.
              </Text>
            </View>
          ) : loadingRepos ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.emptyText}>Loading repositories...</Text>
            </View>
          ) : repos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={64} color={Colors.tertiaryText} />
              <Text style={styles.emptyTitle}>No Repositories Found</Text>
              <Text style={styles.emptyText}>
                {reposError || `No repositories found for ${settings.githubUsername}`}
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={refetch}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          {/* Message input area */}
          {!showNoUsername && repos.length > 0 && (
            <View style={styles.inputContainer}>
              <MessageInputView
                text={messageText}
                placeholder="Ask Claude to help with code..."
                onChangeText={setMessageText}
                onSend={handleCreateSession}
              />

              {/* Bottom chips */}
              <View style={styles.chipsContainer}>
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setShowModelPicker(true)}
                >
                  <Ionicons name="cube-outline" size={16} color={Colors.primaryText} />
                  <Text style={styles.chipText}>{selectedModel.displayName}</Text>
                  <Ionicons name="chevron-down" size={12} color={Colors.primaryText} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setShowRepoPicker(true)}
                >
                  <Ionicons name="folder-outline" size={16} color={Colors.primaryText} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {selectedRepo?.name || 'Select repo'}
                  </Text>
                </TouchableOpacity>

                {selectedRepo && (
                  <TouchableOpacity
                    style={styles.chip}
                    onPress={() => setShowBranchPicker(true)}
                  >
                    <Ionicons name="git-branch-outline" size={16} color={Colors.primaryText} />
                    <Text style={styles.chipText}>{selectedBranch || 'main'}</Text>
                    <Ionicons name="chevron-down" size={12} color={Colors.primaryText} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </KeyboardAvoidingView>

        {/* Model Picker Modal */}
        <PickerModal
          visible={showModelPicker}
          onClose={() => setShowModelPicker(false)}
          title="Select Model"
        >
          {allModels.map((model) => (
            <PickerItem
              key={model.id}
              title={model.displayName}
              selected={selectedModel.id === model.id}
              onPress={() => {
                setSelectedModel(model)
                setShowModelPicker(false)
              }}
            />
          ))}
        </PickerModal>

        {/* Repository Picker Modal */}
        <PickerModal
          visible={showRepoPicker}
          onClose={() => setShowRepoPicker(false)}
          title="Select Repository"
        >
          {repos.map((repo) => (
            <PickerItem
              key={repo.id}
              title={repo.name}
              subtitle={repo.description || `Updated: ${new Date(repo.updated_at).toLocaleDateString()}`}
              selected={selectedRepo?.id === repo.id}
              onPress={() => {
                setSelectedRepo(repo)
                setSelectedBranch(repo.default_branch)
                setShowRepoPicker(false)
              }}
            />
          ))}
        </PickerModal>

        {/* Branch Picker Modal */}
        <PickerModal
          visible={showBranchPicker}
          onClose={() => setShowBranchPicker(false)}
          title="Select Branch"
        >
          {loadingBranches ? (
            <View style={{ padding: Spacing.LG, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          ) : (
            branches.map((branch) => (
              <PickerItem
                key={branch.name}
                title={branch.name}
                subtitle={branch.protected ? '🔒 Protected' : undefined}
                selected={selectedBranch === branch.name}
                onPress={() => {
                  setSelectedBranch(branch.name)
                  setShowBranchPicker(false)
                }}
              />
            ))
          )}
        </PickerModal>
      </SafeAreaView>
    </Modal>
  )
}

// Picker Modal Component
const PickerModal: React.FC<{
  visible: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}> = ({ visible, onClose, title, children }) => (
  <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView style={styles.pickerContainer}>
      <View style={styles.pickerHeader}>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.cancelButton}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView>{children}</ScrollView>
    </SafeAreaView>
  </Modal>
)

// Picker Item Component
const PickerItem: React.FC<{
  title: string
  subtitle?: string
  selected: boolean
  onPress: () => void
}> = ({ title, subtitle, selected, onPress }) => (
  <TouchableOpacity style={styles.pickerItem} onPress={onPress}>
    <View style={{ flex: 1 }}>
      <Text style={styles.pickerItemTitle}>{title}</Text>
      {subtitle && <Text style={styles.pickerItemSubtitle} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {selected && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
  </TouchableOpacity>
)

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
    paddingVertical: Spacing.MD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBackground,
  },
  cancelButton: {
    fontSize: 16,
    color: Colors.primaryText,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.XL,
    gap: Spacing.MD,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primaryText,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.secondaryText,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.MD,
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.MD,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primaryText,
  },
  inputContainer: {
    paddingBottom: Spacing.LG,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.SM,
    paddingHorizontal: Spacing.MD,
    paddingTop: Spacing.MD,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.Full,
    borderWidth: 1,
    borderColor: Colors.chipBorder,
    maxWidth: '45%',
  },
  chipText: {
    fontSize: 14,
    color: Colors.primaryText,
    flex: 1,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBackground,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.MD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surfaceBackground,
  },
  pickerItemTitle: {
    fontSize: 16,
    color: Colors.primaryText,
  },
  pickerItemSubtitle: {
    fontSize: 13,
    color: Colors.secondaryText,
    marginTop: 2,
  },
})

export default NewSessionSheet
