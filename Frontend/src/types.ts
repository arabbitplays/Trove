export type ContentItem = {
  id: string
  addedAt: string
  takenAt: string | null
  tags: string[]
  autoTags: string[]
  mediaType: string
  description: string
}

export type Page = {
  items: ContentItem[]
  total: number
  skip: number
  take: number
}

export type ContentSelectionState =
  | { mode: 'some'; ids: string[] }
  | { mode: 'all'; excludedIds: string[] }

export type PeriodRecord = {
  id: string
  name: string
  startDate: string
  endDate: string
  titleImageId: string | null
  contentIds: string[]
}

export type PeriodSummary = {
  id: string
  name: string
  startDate: string
  endDate: string
}

export type TagSummary = {
  name: string
  contentCount: number
  isAuto: boolean
}

export type TagResult = {
  tags: string[]
  autoTags: string[]
  availableTags: string[]
}
