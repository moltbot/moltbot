import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SETTINGS_KEY = '@clawdbot_settings'

export interface Settings {
  githubUsername: string
  gatewayUrl: string
}

const DEFAULT_SETTINGS: Settings = {
  githubUsername: '',
  gatewayUrl: 'ws://localhost:18789',
}

export const loadSettings = async (): Promise<Settings> => {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch (e) {
    console.error('Failed to load settings', e)
  }
  return DEFAULT_SETTINGS
}

export const saveSettings = async (settings: Settings): Promise<void> => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    console.error('Failed to save settings', e)
  }
}

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings().then((loaded) => {
      setSettings(loaded)
      setLoading(false)
    })
  }, [])

  const updateSettings = async (updates: Partial<Settings>) => {
    const newSettings = { ...settings, ...updates }
    setSettings(newSettings)
    await saveSettings(newSettings)
  }

  return { settings, updateSettings, loading }
}
