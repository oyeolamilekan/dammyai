export type CoreMemoryItem = {
  id: string
  key: string
  value: string
  source: string
  createdAt: string
  updatedAt: string
}

export type ArchivalMemoryItem = {
  id: string
  content: string
  tags: string | null
  createdAt: string
  updatedAt: string
}

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName: string | null
  modelId: string | null
  searchProvider: string | null
  createdAt: string
}

export type PaginatedResult<TItem> = {
  items: Array<TItem>
  page: number
  totalPages: number
}
