import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Moon, Sun } from 'lucide-react'
import ImportPopup from './ImportPopup'
import ImageSelection from './ImageSelection'
import PeriodsView from './PeriodsView'
import ContentMetadataEditor from './ContentMetadataEditor'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
type ContentItem = { id: string; addedAt: string; takenAt: string | null; tags: string[]; autoTags: string[]; mediaType: string; description: string }
type Page = { items: ContentItem[]; total: number; skip: number; take: number }
type ContentSelectionState = { mode: 'some'; ids: string[] } | { mode: 'all'; excludedIds: string[] }

export default function App() {
  const [page, setPage] = useState<Page>({ items: [], total: 0, skip: 0, take: 48 })
  const [allTags, setAllTags] = useState<string[]>([])
  const [autoTagNames, setAutoTagNames] = useState<string[]>([])
  const [tagsLoaded, setTagsLoaded] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [contentSelection, setContentSelection] = useState<ContentSelectionState>({ mode: 'some', ids: [] })
  const [activeTab, setActiveTab] = useState<'content' | 'periods'>('content')
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  const [selectedId, setSelectedId] = useState('')
  const [actionsMenu, setActionsMenu] = useState<{ x: number; y: number; tagOpen: boolean } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarMounted, setSidebarMounted] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('content-theme') === 'dark')
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({})
  const [tagShortcuts, setTagShortcuts] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('content-tag-shortcuts') ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  })
  const [loading, setLoading] = useState(true)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [importing, setImporting] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [notice, setNotice] = useState('')
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})
  const picker = useRef<HTMLInputElement | null>(null)
  const navigationPending = useRef(false)
  const pageRef = useRef(page)
  const selectedTagsRef = useRef(selectedTags)
  const nextPageRequest = useRef<Promise<ContentItem[]> | null>(null)
  const gridEndRef = useRef<HTMLDivElement>(null)
  const contentSelectionAnchor = useRef<string | null>(null)
  selectedTagsRef.current = selectedTags

  const refresh = useCallback(async (tags = selectedTags) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ skip: '0', take: '100' })
      tags.forEach(tag => params.append('tag', tag))
      const tagParams = new URLSearchParams()
      tags.forEach(tag => tagParams.append('tag', tag))
      const [contentsResponse, tagsResponse] = await Promise.all([
        fetch(`${API}/api/contents?${params}`),
        fetch(`${API}/api/tags?${tagParams}`),
      ])
      if (!contentsResponse.ok || !tagsResponse.ok) throw new Error('Request failed')
      const nextPage = await contentsResponse.json() as Page
      const tagResult = await tagsResponse.json() as { tags: string[]; autoTags: string[]; availableTags: string[] }
      pageRef.current = nextPage
      setPage(nextPage)
      setAllTags(tagResult.tags)
      setAutoTagNames(tagResult.autoTags)
      setAvailableTags(tagResult.availableTags)
      setTagsLoaded(true)
    } catch {
      setApiAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [selectedTags])

  const refreshTagData = useCallback(async () => {
    const tagParams = new URLSearchParams()
    selectedTags.forEach(tag => tagParams.append('tag', tag))
    try {
      const response = await fetch(`${API}/api/tags?${tagParams}`)
      if (!response.ok) throw new Error('Could not load tags')
      const tagResult = await response.json() as { tags: string[]; autoTags: string[]; availableTags: string[] }
      setAllTags(tagResult.tags)
      setAutoTagNames(tagResult.autoTags)
      setAvailableTags(tagResult.availableTags)
      setTagsLoaded(true)
    } catch {
      setApiAvailable(false)
    }
  }, [selectedTags])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    setContentSelection({ mode: 'some', ids: [] })
  }, [selectedTags])

  useEffect(() => {
    localStorage.setItem('content-tag-shortcuts', JSON.stringify(tagShortcuts))
  }, [tagShortcuts])

  useEffect(() => {
    if (!tagsLoaded) return
    setTagShortcuts(current => Object.fromEntries(Object.entries(current).filter(([, tag]) => !tag || allTags.includes(tag))))
  }, [allTags, tagsLoaded])

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('content-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    let active = true
    let timer: number | undefined

    const checkHealth = async () => {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(`${API}/api/health`, { signal: controller.signal })
        if (!response.ok) throw new Error('Health check failed')
        if (active) setApiAvailable(true)
      } catch {
        if (active) setApiAvailable(false)
      } finally {
        window.clearTimeout(timeout)
        if (active) timer = window.setTimeout(() => void checkHealth(), 15000)
      }
    }

    void checkHealth()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  async function importFiles(files: File[], tags: string[]) {
    if (!files.length) return
    setImporting(true)
    setNotice('')
    let importCompleted = false
    const form = new FormData()
    files.forEach(file => form.append('files', file, file.name))
    try {
      const response = await fetch(`${API}/api/import`, { method: 'POST', body: form })
      if (!response.ok) throw new Error('Import failed')
      const result = await response.json() as { imported: number; errors: string[]; ids: string[] }
      importCompleted = true
      const tagResults = await Promise.all(tags.map(tag => updateTagForContent(result.ids, tag)))
      if (tagResults.some(ok => !ok)) throw new Error('Could not apply selected tags')
      setNotice(`Added ${result.imported}${result.errors.length ? `; ${result.errors.length} skipped` : ''}.`)
      setPendingFiles(null)
      await refresh()
    } catch {
      setPendingFiles(null)
      setNotice(importCompleted
        ? 'Files imported, but some selected tags could not be applied.'
        : 'Import failed. Check the API connection and try again.')
      if (importCompleted) await refresh()
    } finally {
      setImporting(false)
      if (picker.current) picker.current.value = ''
    }
  }

  async function updateTag(id: string, tag: string, remove = false): Promise<boolean> {
    if (!remove && autoTagNames.includes(tag.trim().toLowerCase())) return false
    const previousPage = pageRef.current
    const previousTags = previousPage.items.find(item => item.id === id)?.tags
    const tagWasPresent = previousTags?.includes(tag) ?? false
    if (previousTags) {
      const optimisticPage = {
        ...previousPage,
        items: previousPage.items.map(item => item.id !== id ? item : {
          ...item,
          tags: remove ? item.tags.filter(itemTag => itemTag !== tag) : [...new Set([...item.tags, tag])].sort(),
        }),
      }
      pageRef.current = optimisticPage
      setPage(optimisticPage)
    }

    const ok = await updateTagForContent([id], tag, remove)
    if (!ok) {
      if (previousTags) {
        const currentPage = pageRef.current
        const rollbackPage = {
          ...currentPage,
          items: currentPage.items.map(item => item.id !== id ? item : {
            ...item,
            tags: remove
              ? tagWasPresent ? [...new Set([...item.tags, tag])].sort() : item.tags
              : tagWasPresent ? item.tags : item.tags.filter(itemTag => itemTag !== tag),
          }),
        }
        pageRef.current = rollbackPage
        setPage(rollbackPage)
      }
      setNotice('Could not update this tag.')
      return false
    }
    setTagDrafts(current => ({ ...current, [id]: '' }))
    if (remove && selectedTags.includes(tag)) {
      await refresh()
      return true
    }
    await refreshTagData()
    return true
  }

  async function updateTagForContent(ids: string[], tag: string, remove = false) {
    if (!ids.length) return true
    const url = `${API}/api/tags/${encodeURIComponent(tag)}`
    const response = await fetch(url, {
      method: remove ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids),
    })
    if (!response.ok) {
      return false
    }
    return true
  }

  async function handlePeriodTagsChanged(tag: string, remove: boolean) {
    if (remove && selectedTags.includes(tag)) await refresh()
    else await refreshTagData()
  }

  async function saveMetadata(id: string, description: string, takenAt: string | null): Promise<boolean> {
    const current = pageRef.current.items.find(item => item.id === id)
    if (!current) return false
    if (description === current.description && takenAt === current.takenAt) return true
    const response = await fetch(`${API}/api/contents/${id}/metadata`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, takenAt }),
    })
    if (!response.ok) {
      setNotice('Could not save the content metadata.')
      return false
    }
    const updatedPage = {
      ...pageRef.current,
      items: pageRef.current.items.map(item => item.id === id ? { ...item, description, takenAt } : item),
    }
    pageRef.current = updatedPage
    setPage(updatedPage)
    setDescriptionDrafts(currentDrafts => {
      if (currentDrafts[id] !== description) return currentDrafts
      const next = { ...currentDrafts }
      delete next[id]
      return next
    })
    return true
  }

  const visible = page.items
  const selectedCount = contentSelection.mode === 'all'
    ? Math.max(0, page.total - contentSelection.excludedIds.length)
    : contentSelection.ids.length
  const allSelected = contentSelection.mode === 'all' && contentSelection.excludedIds.length === 0

  const tagPicker = <nav className="tag-picker" aria-label="Filter by tags">
    <div className="tag-picker-row" aria-label="Selected tags">
      {selectedTags.length === 0
        ? <span className="filter active" aria-current="true">All</span>
        : selectedTags.map(tag => <button key={tag} className="filter active" type="button" onClick={() => setSelectedTags(current => current.filter(item => item !== tag))} aria-label={`Remove ${tag} filter`}>{tag}<span aria-hidden="true"> ×</span></button>)}
      {selectedTags.length > 0 && <button className="text-button" type="button" onClick={() => setSelectedTags([])}>Clear filters</button>}
    </div>
    <div className="tag-picker-row" aria-label="Tags with matching content">
      {availableTags.filter(tag => !selectedTags.includes(tag)).map(tag => <button key={tag} className="filter" type="button" onClick={() => setSelectedTags(current => [...current, tag])}>{tag}</button>)}
      {availableTags.filter(tag => !selectedTags.includes(tag)).length === 0 && <span className="tag-picker-empty">No more matching tags</span>}
    </div>
  </nav>

  function toggleContentSelection(id: string, shiftKey = false) {
    if (shiftKey && contentSelectionAnchor.current) {
      const anchorIndex = visible.findIndex(item => item.id === contentSelectionAnchor.current)
      const clickedIndex = visible.findIndex(item => item.id === id)
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const [start, end] = [anchorIndex, clickedIndex].sort((a, b) => a - b)
        setContentSelection({ mode: 'some', ids: visible.slice(start, end + 1).map(item => item.id) })
        return
      }
    }
    contentSelectionAnchor.current = id
    setContentSelection(current => {
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

  function toggleAllContentSelection() {
    setContentSelection(current => current.mode === 'all' && current.excludedIds.length === 0
      ? { mode: 'some', ids: [] }
      : { mode: 'all', excludedIds: [] })
  }

  async function selectedContentIds(): Promise<string[]> {
    if (contentSelection.mode === 'some') return contentSelection.ids
    const ids: string[] = []
    for (let skip = 0; skip < page.total; skip += 100) {
      const batch = await fetchContentPage(skip, selectedTags)
      ids.push(...batch.items.map(item => item.id).filter(id => !contentSelection.excludedIds.includes(id)))
    }
    return ids
  }

  async function applyBulkTag(tag: string) {
    const ids = await selectedContentIds()
    const ok = await updateTagForContent(ids, tag)
    setActionsMenu(null)
    if (ok) {
      const selectedIds = new Set(ids)
      const currentPage = pageRef.current
      const updatedPage = {
        ...currentPage,
        items: currentPage.items.map(item => selectedIds.has(item.id)
          ? { ...item, tags: [...new Set([...item.tags, tag])].sort() }
          : item),
      }
      pageRef.current = updatedPage
      setPage(updatedPage)
      setNotice(`Added tag “${tag}” to ${ids.length} images.`)
      await refreshTagData()
    }
    else setNotice('Could not apply the selected tag.')
  }

  async function deleteSelectedContent() {
    const ids = await selectedContentIds()
    if (!ids.length || !window.confirm(`Delete ${ids.length} selected image${ids.length === 1 ? '' : 's'}?`)) return
    const results = await Promise.all(ids.map(id => fetch(`${API}/api/contents/${id}`, { method: 'DELETE' })))
    setActionsMenu(null)
    if (results.some(response => !response.ok)) setNotice('Some selected images could not be deleted.')
    else setNotice(`Deleted ${ids.length} images.`)
    setContentSelection({ mode: 'some', ids: [] })
    await refresh()
  }

  const loadNextBatch = useCallback((): Promise<ContentItem[]> => {
    if (nextPageRequest.current) return nextPageRequest.current
    const current = pageRef.current
    const skip = current.items.length
    const tags = selectedTagsRef.current
    if (skip >= current.total) return Promise.resolve([])

    const request = fetchContentPage(skip, tags).then(batch => {
      const latest = pageRef.current
      if (selectedTagsRef.current.join('\0') !== tags.join('\0') || latest.items.length !== skip || !batch.items.length) return []
      const expanded = { ...batch, items: [...latest.items, ...batch.items] }
      pageRef.current = expanded
      setPage(expanded)
      return batch.items
    }).catch(() => {
      return []
    }).finally(() => {
      nextPageRequest.current = null
    })
    nextPageRequest.current = request
    return request
  }, [])

  async function moveSelection(direction: -1 | 1) {
    const currentPage = pageRef.current
    const visible = currentPage.items
    const currentIndex = visible.findIndex(item => item.id === selectedId)
    const effectiveIndex = currentIndex < 0 ? 0 : currentIndex
    const next = visible[effectiveIndex + direction]
    if (next) {
      setSelectedId(next.id)
      return
    }
    if (direction < 0 || currentPage.items.length >= currentPage.total) return
    if (navigationPending.current) return

    navigationPending.current = true
    try {
      while (pageRef.current.items.length < pageRef.current.total) {
        const batch = await loadNextBatch()
        if (!batch.length) return
        setSelectedId(batch[0].id)
        return
      }
    } finally {
      navigationPending.current = false
    }
  }

  useEffect(() => {
    if (loading || page.items.length >= page.total) return
    if (visible.length === 0) {
      void loadNextBatch()
      return
    }
    if (viewMode !== 'single') return
    const selectedIndex = page.items.findIndex(item => item.id === selectedId)
    if (selectedIndex >= 0 && page.items.length - selectedIndex <= 10)
      void loadNextBatch()
  }, [viewMode, loading, page, selectedId, visible.length, loadNextBatch])

  useEffect(() => {
    if (activeTab !== 'content' || viewMode !== 'grid' || loading || !gridEndRef.current || page.items.length >= page.total) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadNextBatch()
    }, { rootMargin: '600px' })
    observer.observe(gridEndRef.current)
    return () => observer.disconnect()
  }, [activeTab, viewMode, loading, page.items.length, page.total, loadNextBatch])

  useEffect(() => {
    if (activeTab !== 'content' || viewMode !== 'single') return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLTextAreaElement && target.id === 'content-description') return
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      void moveSelection(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeTab, viewMode, page, selectedId, selectedTags])

  const selectedContent = visible.find(item => item.id === selectedId) ?? visible[0]

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#">Content Manager</a>
      <nav className="header-tabs" aria-label="Main sections">
        <button className={`header-tab ${activeTab === 'content' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('content')} aria-current={activeTab === 'content' ? 'page' : undefined}>Content</button>
        <button className={`header-tab ${activeTab === 'periods' ? 'active' : ''}`} type="button" onClick={() => { setActiveTab('periods'); setViewMode('grid') }} aria-current={activeTab === 'periods' ? 'page' : undefined}>Periods</button>
      </nav>
      <div className="top-actions">
        <input
          ref={element => {
            picker.current = element
            element?.setAttribute('webkitdirectory', '')
          }}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={event => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) setPendingFiles(files)
            event.currentTarget.value = ''
          }}
        />
        {!sidebarMounted && <button className="button menu-trigger" type="button" onClick={() => {
          setSidebarMounted(true)
          requestAnimationFrame(() => setSidebarOpen(true))
        }} aria-label="Open menu" aria-expanded={false}>
          <Menu size={20} aria-hidden="true" />
        </button>}
      </div>
    </header>

    {sidebarMounted && <div className={`sidebar-backdrop ${sidebarOpen ? 'sidebar-open' : ''}`} onMouseDown={event => {
      if (event.target === event.currentTarget) setSidebarOpen(false)
    }}>
      <aside className="content-sidebar" aria-label="Main menu" onTransitionEnd={event => {
        if (event.target === event.currentTarget && !sidebarOpen) setSidebarMounted(false)
      }}>
        <header className="sidebar-header">
          <h2>Menu</h2>
          <button className="button menu-trigger" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" aria-expanded={sidebarOpen}>
            <Menu size={20} aria-hidden="true" />
          </button>
        </header>
        <button className="button button-primary sidebar-import" type="button" onClick={() => {
          setSidebarOpen(false)
          picker.current?.click()
        }} disabled={importing}>
          {importing ? 'Importing…' : 'Import folder'}
        </button>
        <button className="button sidebar-theme-toggle" type="button" onClick={() => setDarkMode(value => !value)} aria-pressed={darkMode}>
          {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          {darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
      </aside>
    </div>}

    {apiAvailable === false && <div className="health-alert" role="alert">
      API or database unavailable. Check that the backend and PostgreSQL are running.
    </div>}

    {pendingFiles && <ImportPopup
      files={pendingFiles}
      tags={allTags}
      importing={importing}
      onCancel={() => setPendingFiles(null)}
      onImport={importFiles}
    />}

    {notice && <div className="notice" role="status">
      <span>{notice}</span>
      <button className="text-button" onClick={() => setNotice('')} aria-label="Dismiss message">Dismiss</button>
    </div>}

    {activeTab === 'content' ? <>
    <section className="library-heading">
      <h1>Library</h1>
      <span>{page.total.toLocaleString()} total</span>
      <div className="view-toggle" role="group" aria-label="View mode">
        <button className={`button ${viewMode === 'grid' ? 'button-primary' : ''}`} type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'}>Grid</button>
        <button className={`button ${viewMode === 'single' ? 'button-primary' : ''}`} type="button" onClick={() => {
          setSelectedId(visible[0]?.id ?? '')
          setViewMode('single')
        }} aria-pressed={viewMode === 'single'}>Single</button>
      </div>
    </section>

    {tagPicker}

    {loading ? <p className="state">Loading library…</p> : visible.length === 0 ? <section className="state empty-state">
        <h2>{selectedTags.length ? 'No media found' : 'No media yet'}</h2>
        <p>{selectedTags.length ? 'Try removing a selected tag.' : 'Import a folder to add images and videos to your library.'}</p>
    </section> : viewMode === 'grid' ? <ImageSelection
      items={visible}
      total={page.total}
      selectedCount={selectedCount}
      onActions={(x, y) => setActionsMenu({ x, y, tagOpen: false })}
      onContextMenu={(id, x, y) => {
        setContentSelection({ mode: 'some', ids: [id] })
        setActionsMenu({ x, y, tagOpen: false })
      }}
      allSelected={allSelected}
      isSelected={id => contentSelection.mode === 'all'
        ? !contentSelection.excludedIds.includes(id)
        : contentSelection.ids.includes(id)}
      onToggleAll={toggleAllContentSelection}
      onToggle={toggleContentSelection}
      onOpen={(item, shiftKey) => {
        if (shiftKey) {
          toggleContentSelection(item.id, true)
          return
        }
        setSelectedId(item.id)
        setViewMode('single')
      }}
      renderDetails={item => <div className="content-details">
          <div className="card-tags">
            {item.tags.map(tag => <button
              key={tag}
              className="tag"
              onClick={() => void updateTag(item.id, tag, true)}
              title={`Remove ${tag}`}
            >{tag}<span aria-hidden="true"> ×</span></button>)}
            {item.autoTags.map(tag => <span key={tag} className="tag tag-auto" title="Assigned automatically">{tag}</span>)}
            <form onSubmit={event => {
              event.preventDefault()
              const tag = tagDrafts[item.id]?.trim()
              if (tag) void updateTag(item.id, tag)
            }}>
              <input
                className="tag-input"
                aria-label="Add tag to content"
                placeholder="Add tag"
                value={tagDrafts[item.id] ?? ''}
                onChange={event => setTagDrafts(state => ({ ...state, [item.id]: event.target.value }))}
                onKeyDown={event => {
                  if (event.key === 'Enter' && autoTagNames.includes(event.currentTarget.value.trim().toLowerCase())) event.preventDefault()
                }}
              />
            </form>
          </div>
        </div>}
      endRef={gridEndRef}
    /> : selectedContent ? <section className="single-content" aria-label="Single content view">
      <header className="single-content-heading">
        <div className="single-content-title">
          <span>{page.items.findIndex(item => item.id === selectedContent.id) + 1} of {page.total.toLocaleString()}</span>
        </div>
      </header>
      <div className="single-content-frame">
        {selectedContent.mediaType.startsWith('video/')
          ? <video className="full-content" src={`${API}/api/contents/${selectedContent.id}/content`} controls preload="metadata" />
          : <img className="full-content" src={`${API}/api/contents/${selectedContent.id}/content`} alt="Selected content" />}
      </div>
      <ContentMetadataEditor
        content={selectedContent}
        allTags={allTags}
        autoTagNames={autoTagNames}
        description={descriptionDrafts[selectedContent.id] ?? selectedContent.description}
        onDescriptionChange={value => setDescriptionDrafts(state => ({ ...state, [selectedContent.id]: value }))}
        onSaveMetadata={saveMetadata}
        tagShortcuts={tagShortcuts}
        onShortcutChange={(number, tag) => setTagShortcuts(current => ({ ...current, [number]: tag }))}
        onApplyShortcut={(id, tag) => { void updateTag(id, tag) }}
        onAddTag={updateTag}
        onRemoveTag={(id, tag) => { void updateTag(id, tag, true) }}
      />
    </section> : <p className="state">No content in this view.</p>}
    {actionsMenu && <div className="actions-menu-backdrop" onClick={() => setActionsMenu(null)} onContextMenu={event => { event.preventDefault(); setActionsMenu(null) }}>
      <div className="actions-menu" role="menu" style={{ left: Math.min(actionsMenu.x, window.innerWidth - 220), top: Math.min(actionsMenu.y, window.innerHeight - 260) }} onClick={event => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={() => void deleteSelectedContent()}>Delete</button>
        <button type="button" role="menuitem" aria-haspopup="true" aria-expanded={actionsMenu.tagOpen} onClick={() => setActionsMenu(current => current && ({ ...current, tagOpen: !current.tagOpen }))}>Add tag ▸</button>
        {actionsMenu.tagOpen && <div className="actions-tag-list" role="menu" aria-label="Choose tag">
          {allTags.length ? allTags.map(tag => <button type="button" role="menuitem" key={tag} onClick={() => void applyBulkTag(tag)}>{tag}</button>) : <span>No existing tags</span>}
        </div>}
      </div>
    </div>}
    </> : <PeriodsView
      contents={visible}
      totalContents={page.total}
      selectedTags={selectedTags}
      onToggleTag={tag => setSelectedTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag])}
      onClearTags={() => setSelectedTags([])}
      availableTags={availableTags}
      allTags={allTags}
      autoTagNames={autoTagNames}
      endRef={gridEndRef}
      loadNextBatch={loadNextBatch}
      onTagsChanged={handlePeriodTagsChanged}
      tagShortcuts={tagShortcuts}
      onShortcutChange={(number, tag) => setTagShortcuts(current => ({ ...current, [number]: tag }))}
    />}

  </main>
}

async function fetchContentPage(skip: number, tags: string[]): Promise<Page> {
  const params = new URLSearchParams({ skip: String(skip), take: '100' })
  tags.forEach(tag => params.append('tag', tag))
  const response = await fetch(`${API}/api/contents?${params}`)
  if (!response.ok) return { items: [], total: 0, skip, take: 100 }
  return await response.json() as Page
}
