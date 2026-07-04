import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainLayout from '@/components/layout/MainLayout'
import SetupWizard from '@/components/common/SetupWizard'
import Dashboard from '@/pages/Dashboard'
import ProjectAnalysis from '@/pages/ProjectAnalysis'
import LearningPath from '@/pages/LearningPath'
import DailyLesson from '@/pages/DailyLesson'
import AIChat from '@/pages/AIChat'
import Settings from '@/pages/Settings'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUserStore } from '@/stores/useUserStore'

const ACCENT_MAP: Record<string, { accent: string; light: string; dark: string; green: string; greenLight: string; purple: string; purpleLight: string; amber: string; amberLight: string }> = {
  amber: { accent: '#C4703F', light: '#F0DDD0', dark: '#8B4513', green: '#5B8C5A', greenLight: '#E8F0E8', purple: '#7B6BA5', purpleLight: '#EDE8F5', amber: '#C49A3F', amberLight: '#F5EDD8' },
  green: { accent: '#5B8C5A', light: '#E8F0E8', dark: '#2E5A2E', green: '#5B8C5A', greenLight: '#E8F0E8', purple: '#7B6BA5', purpleLight: '#EDE8F5', amber: '#C49A3F', amberLight: '#F5EDD8' },
  purple: { accent: '#8B5CF6', light: '#F3E8FF', dark: '#5B21B6', green: '#5B8C5A', greenLight: '#E8F0E8', purple: '#7B6BA5', purpleLight: '#EDE8F5', amber: '#C49A3F', amberLight: '#F5EDD8' },
}

function useTheme() {
  const { theme, accentColor, editorFontSize } = useSettingsStore()

  useEffect(() => {
    const root = document.documentElement

    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    const colors = ACCENT_MAP[accentColor] || ACCENT_MAP.amber
    root.style.setProperty('--cm-accent', colors.accent)
    root.style.setProperty('--cm-accent-light', colors.light)
    root.style.setProperty('--cm-accent-dark', colors.dark)
    root.style.setProperty('--editor-font-size', `${editorFontSize}px`)
  }, [theme, accentColor, editorFontSize])
}

export default function App() {
  useTheme()
  const { setupCompleted } = useSettingsStore()
  const { currentUserId, dataLoaded, selectUser } = useUserStore()

  // 如果有记住的用户 ID 但数据还没加载，自动加载
  useEffect(() => {
    if (currentUserId && !dataLoaded) {
      selectUser(currentUserId)
    }
  }, [currentUserId, dataLoaded, selectUser])

  // 未完成设置（包括未选择用户）时显示向导
  if (!setupCompleted) {
    return <SetupWizard />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project" element={<ProjectAnalysis />} />
          <Route path="/learn" element={<LearningPath />} />
          <Route path="/learn/:language" element={<LearningPath />} />
          <Route path="/learn/:language/day/:dayId" element={<DailyLesson />} />
          <Route path="/chat" element={<AIChat />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
