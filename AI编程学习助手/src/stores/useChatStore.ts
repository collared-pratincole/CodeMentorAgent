import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  model?: string
}

interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  setStreaming: (streaming: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          timestamp: new Date(),
        },
      ],
    })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearMessages: () => set({ messages: [] }),
}))
