import { useEffect, useRef, useState, type RefObject } from 'react'
import PeriodList from './components/periods/PeriodList'
import PeriodDetail from './components/periods/PeriodDetail'
import AddImagesModal from './components/periods/AddImagesModal'
import { API } from './config'
import type { ContentItem, ContentSelectionState, PeriodRecord } from './types'

type Props = {
  contents: ContentItem[]
  totalContents: number
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  onClearTags: () => void
  availableTags: string[]
  allTags: string[]
  autoTagNames: string[]
  endRef: RefObject<HTMLDivElement>
  loadNextBatch: () => Promise<ContentItem[]>
  onTagsChanged: (tag: string, remove: boolean) => Promise<void>
  tagShortcuts: Record<string, string>
  onShortcutChange: (number: string, tag: string) => void
  selectedPeriodId?: string | null
  onClearSelectedPeriod?: () => void
}

export default function PeriodsView({
  contents,
  totalContents,
  selectedTags,
  onToggleTag,
  onClearTags,
  availableTags,
  allTags,
  autoTagNames,
  endRef,
  loadNextBatch,
  onTagsChanged,
  tagShortcuts,
  onShortcutChange,
  selectedPeriodId,
  onClearSelectedPeriod,
}: Props) {
  const [periods, setPeriods] = useState<PeriodRecord[]>([])
  const [editing, setEditing] = useState<PeriodRecord | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [periodContents, setPeriodContents] = useState<ContentItem[]>([])
  const [addPopupOpen, setAddPopupOpen] = useState(false)
  const [selection, setSelection] = useState<ContentSelectionState>({ mode: 'some', ids: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const addImageSelectionAnchor = useRef<string | null>(null)

  async function loadPeriods() {
    const response = await fetch(`${API}/api/periods`)
    if (!response.ok) throw new Error('Could not load periods.')
    setPeriods((await response.json()) as PeriodRecord[])
  }

  async function loadPeriodContents(id: string) {
    const response = await fetch(`${API}/api/periods/${id}/contents`)
    if (!response.ok) throw new Error('Could not load images in this period.')
    setPeriodContents((await response.json()) as ContentItem[])
  }

  useEffect(() => {
    void loadPeriods().catch(() => setError('Could not load periods.'))
  }, [])

  useEffect(() => {
    if (!selectedPeriodId) return
    if (editing?.id === selectedPeriodId) return

    const target = periods.find(p => p.id === selectedPeriodId)
    if (target) {
      beginEdit(target)
    } else {
      void fetch(`${API}/api/periods/${selectedPeriodId}`)
        .then(res => (res.ok ? ((res.json()) as Promise<PeriodRecord>) : null))
        .then(period => {
          if (period) beginEdit(period)
        })
        .catch(() => {})
    }
  }, [selectedPeriodId, periods, editing?.id])

  useEffect(() => {
    setSelection({ mode: 'some', ids: [] })
  }, [selectedTags])

  useEffect(() => {
    if ((!editing && !isNew) || !addPopupOpen || contents.length >= totalContents || !endRef.current) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) void loadNextBatch()
      },
      { rootMargin: '600px' }
    )
    observer.observe(endRef.current)
    return () => observer.disconnect()
  }, [editing, isNew, addPopupOpen, contents.length, totalContents, endRef, loadNextBatch])

  function beginCreate() {
    setEditing(null)
    setPeriodContents([])
    setIsNew(true)
    setError('')
  }

  function beginEdit(period: PeriodRecord) {
    setEditing(period)
    setIsNew(false)
    setSelection({ mode: 'some', ids: [] })
    setError('')
    setAddPopupOpen(false)
    void loadPeriodContents(period.id).catch(caught =>
      setError(caught instanceof Error ? caught.message : 'Could not load period images.')
    )
  }

  async function createPeriod(data: { name: string; startDate: string; endDate: string }) {
    if (!data.startDate || !data.endDate) {
      setError('Choose both a start date and an end date.')
      return
    }
    if (data.endDate < data.startDate) {
      setError('The end date must be on or after the start date.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(errorJson?.error ?? 'Could not create period.')
      }
      const created = (await response.json()) as PeriodRecord
      setPeriods(current => [...current, created])
      beginEdit(created)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create period.')
    } finally {
      setBusy(false)
    }
  }

  async function savePeriodFields(fields: { name?: string; startDate?: string; endDate?: string }): Promise<boolean> {
    if (!editing) return false
    const nextName = fields.name ?? editing.name
    const nextStart = fields.startDate ?? editing.startDate.slice(0, 10)
    const nextEnd = fields.endDate ?? editing.endDate.slice(0, 10)

    if (nextEnd < nextStart) {
      setError('The end date must be on or after the start date.')
      return false
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nextName,
          startDate: nextStart,
          endDate: nextEnd,
          titleImageId: editing.titleImageId,
        }),
      })
      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(errorJson?.error ?? 'Could not save period.')
      }
      const updated: PeriodRecord = {
        ...editing,
        name: nextName,
        startDate: nextStart,
        endDate: nextEnd,
      }
      setEditing(updated)
      setPeriods(current => current.map(p => (p.id === updated.id ? updated : p)))
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save period.')
      return false
    } finally {
      setBusy(false)
    }
  }

  function toggleAddImageSelection(id: string, shiftKey = false) {
    if (shiftKey && addImageSelectionAnchor.current) {
      const anchorIndex = contents.findIndex(item => item.id === addImageSelectionAnchor.current)
      const clickedIndex = contents.findIndex(item => item.id === id)
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const [start, end] = [anchorIndex, clickedIndex].sort((a, b) => a - b)
        setSelection({ mode: 'some', ids: contents.slice(start, end + 1).map(item => item.id) })
        return
      }
    }
    addImageSelectionAnchor.current = id
    setSelection(current => {
      if (current.mode === 'all') {
        const excluded = new Set(current.excludedIds)
        if (excluded.has(id)) excluded.delete(id)
        else excluded.add(id)
        return { mode: 'all', excludedIds: [...excluded] }
      }
      const ids = new Set(current.ids)
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return { mode: 'some', ids: [...ids] }
    })
  }

  function toggleAllAddImageSelection() {
    setSelection(current =>
      current.mode === 'all' && current.excludedIds.length === 0
        ? { mode: 'some', ids: [] }
        : { mode: 'all', excludedIds: [] }
    )
  }

  async function addSelectedToPeriod() {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods/${editing.id}/contents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          selection.mode === 'all'
            ? { allMatching: true, tags: selectedTags, excludedIds: selection.excludedIds }
            : { allMatching: false, ids: selection.ids }
        ),
      })
      if (!response.ok) throw new Error('Could not add selected content to the period.')
      const updated = await fetch(`${API}/api/periods/${editing.id}`)
      if (!updated.ok) throw new Error('Content was added, but the period could not be refreshed.')
      const next = (await updated.json()) as PeriodRecord
      setEditing(next)
      setPeriods(current => current.map(p => (p.id === next.id ? next : p)))
      await loadPeriodContents(editing.id)
      setSelection({ mode: 'some', ids: [] })
      setAddPopupOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add selected content.')
    } finally {
      setBusy(false)
    }
  }

  async function removeContent(id: string) {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `${API}/api/periods/${editing.id}/contents/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      if (!response.ok) throw new Error('Could not remove content from the period.')
      const updatedContentIds = editing.contentIds.filter(item => item !== id)
      const updatedTitleImage = editing.titleImageId === id ? null : editing.titleImageId
      const updated: PeriodRecord = {
        ...editing,
        contentIds: updatedContentIds,
        titleImageId: updatedTitleImage,
      }
      setEditing(updated)
      setPeriods(current => current.map(p => (p.id === updated.id ? updated : p)))
      setPeriodContents(current => current.filter(item => item.id !== id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove content.')
    } finally {
      setBusy(false)
    }
  }

  async function removeSelectedContents(ids: string[]) {
    if (!editing || !ids.length) return
    setBusy(true)
    setError('')
    try {
      await Promise.all(
        ids.map(id =>
          fetch(`${API}/api/periods/${editing.id}/contents/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          })
        )
      )
      const removedSet = new Set(ids)
      const updatedContentIds = editing.contentIds.filter(id => !removedSet.has(id))
      const updatedTitleImage =
        editing.titleImageId && removedSet.has(editing.titleImageId) ? null : editing.titleImageId
      const updated: PeriodRecord = {
        ...editing,
        contentIds: updatedContentIds,
        titleImageId: updatedTitleImage,
      }
      setEditing(updated)
      setPeriods(current => current.map(p => (p.id === updated.id ? updated : p)))
      setPeriodContents(current => current.filter(item => !removedSet.has(item.id)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove selected images.')
    } finally {
      setBusy(false)
    }
  }

  async function setTitleImage(id: string) {
    if (!editing) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/periods/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editing.name,
          startDate: editing.startDate,
          endDate: editing.endDate,
          titleImageId: id,
        }),
      })
      if (!response.ok) throw new Error('Could not set the title image.')
      const updated: PeriodRecord = { ...editing, titleImageId: id }
      setEditing(updated)
      setPeriods(current => current.map(p => (p.id === updated.id ? updated : p)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set the title image.')
    } finally {
      setBusy(false)
    }
  }

  async function deletePeriod(id: string) {
    const period = periods.find(item => item.id === id)
    if (!period || !window.confirm(`Delete period “${period.name}”?`)) return
    const response = await fetch(`${API}/api/periods/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      setError('Could not delete the period.')
      return
    }
    setPeriods(current => current.filter(item => item.id !== id))
    if (editing?.id === id) {
      setEditing(null)
      setIsNew(false)
    }
  }

  async function saveMetadata(id: string, description: string, takenAt: string | null): Promise<boolean> {
    const item = periodContents.find(content => content.id === id)
    if (!item || (item.description === description && item.takenAt === takenAt)) return true
    const response = await fetch(`${API}/api/contents/${id}/metadata`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, takenAt }),
    })
    if (!response.ok) {
      setError('Could not save the content metadata.')
      return false
    }
    setPeriodContents(current =>
      current.map(content => (content.id === id ? { ...content, description, takenAt } : content))
    )
    return true
  }

  async function changeTag(id: string, tagValue: string, remove = false): Promise<boolean> {
    const tag = tagValue.trim()
    if (!tag) return false
    if (!remove && autoTagNames.includes(tag.toLowerCase())) return false
    const response = await fetch(`${API}/api/tags/${encodeURIComponent(tag)}`, {
      method: remove ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([id]),
    })
    if (!response.ok) {
      setError('Could not update this tag.')
      return false
    }
    setPeriodContents(current =>
      current.map(content =>
        content.id !== id
          ? content
          : {
              ...content,
              tags: remove
                ? content.tags.filter(existingTag => existingTag !== tag)
                : [...new Set([...content.tags, tag])].sort(),
            }
      )
    )
    await onTagsChanged(tag, remove)
    return true
  }

  if (!editing && !isNew) {
    return (
      <PeriodList
        periods={periods}
        onBeginCreate={beginCreate}
        onBeginEdit={beginEdit}
        onDeletePeriod={deletePeriod}
        error={error}
      />
    )
  }

  return (
    <>
      <PeriodDetail
        period={editing}
        isNew={isNew}
        periodContents={periodContents}
        onBack={() => {
          setEditing(null)
          setIsNew(false)
          setAddPopupOpen(false)
          setError('')
          onClearSelectedPeriod?.()
        }}
        onOpenAddModal={() => {
          addImageSelectionAnchor.current = null
          setSelection({ mode: 'some', ids: [] })
          setAddPopupOpen(true)
        }}
        onSavePeriodFields={savePeriodFields}
        onCreatePeriod={createPeriod}
        onRemoveContent={removeContent}
        onRemoveSelectedContents={removeSelectedContents}
        onSetTitleImage={setTitleImage}
        onSaveMetadata={saveMetadata}
        onChangeTag={changeTag}
        allTags={allTags}
        autoTagNames={autoTagNames}
        tagShortcuts={tagShortcuts}
        onShortcutChange={onShortcutChange}
        busy={busy}
        error={error}
      />
      <AddImagesModal
        open={addPopupOpen && !!editing}
        periodName={editing?.name ?? ''}
        onClose={() => setAddPopupOpen(false)}
        contents={contents}
        totalContents={totalContents}
        selectedTags={selectedTags}
        availableTags={availableTags}
        onToggleTag={onToggleTag}
        onClearTags={onClearTags}
        selection={selection}
        onToggleContent={toggleAddImageSelection}
        onToggleAll={toggleAllAddImageSelection}
        onAddSelected={addSelectedToPeriod}
        busy={busy}
        endRef={endRef}
      />
    </>
  )
}
