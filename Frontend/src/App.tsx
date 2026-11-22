import { useCallback, useEffect, useRef, useState } from 'react'
import { Menu, Moon, Sun } from 'lucide-react'
import ImportPopup from './ImportPopup'
import ImageSelection from './ImageSelection'
import PeriodsView from './PeriodsView'
import ContentMetadataEditor from './ContentMetadataEditor'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
type ContentItem = { hash: string; originalName: string; addedAt: string; tags: string[]; mediaType: string; description: string }
type Page = { items: ContentItem[]; total: number; skip: number; take: number }
type ContentSelectionState = { mode: 'some'; hashes: string[] } | { mode: 'all'; excludedHashes: string[] }

export default function App() {
  const [page, setPage] = useState<Page>({ items: [], total: 0, skip: 0, take: 48 })
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [contentSelection, setContentSelection] = useState<ContentSelectionState>({ mode: 'some', hashes: [] })
  const [activeTab, setActiveTab] = useState<'content' | 'periods'>('content')
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  const [selectedHash, setSelectedHash] = useState('')
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
      const tagResult = await tagsResponse.json() as { tags: string[]; availableTags: string[] }
      pageRef.current = nextPage
      setPage(nextPage)
      setAllTags(tagResult.tags)
      setAvailableTags(tagResult.availableTags)
    } catch {
      setApiAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [selectedTags])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    setContentSelection({ mode: 'some', hashes: [] })
  }, [selectedTags])

  useEffect(() => {
    localStorage.setItem('content-tag-shortcuts', JSON.stringify(tagShortcuts))
  }, [tagShortcuts])

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
      const result = await response.json() as { imported: number; errors: string[]; hashes: string[] }
      importCompleted = true
      const tagResults = await Promise.all(tags.map(tag => updateTagForContent(result.hashes, tag)))
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

  async function updateTag(hash: string, tag: string, remove = false): Promise<boolean> {
    const previousPage = pageRef.current
    const previousTags = previousPage.items.find(item => item.hash === hash)?.tags
    const tagWasPresent = previousTags?.includes(tag) ?? false
    if (previousTags) {
      const optimisticPage = {
        ...previousPage,
        items: previousPage.items.map(item => item.hash !== hash ? item : {
          ...item,
          tags: remove ? item.tags.filter(itemTag => itemTag !== tag) : [...new Set([...item.tags, tag])].sort(),
        }),
      }
      pageRef.current = optimisticPage
      setPage(optimisticPage)
    }

    const ok = await updateTagForContent([hash], tag, remove)
    if (!ok) {
      if (previousTags) {
        const currentPage = pageRef.current
        const rollbackPage = {
          ...currentPage,
          items: currentPage.items.map(item => item.hash !== hash ? item : {
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
    setTagDrafts(current => ({ ...current, [hash]: '' }))
    if (remove && selectedTags.includes(tag)) {
      await refresh()
      return true
    }
    await refresh()
    return true
  }

  async function updateTagForContent(hashes: string[], tag: string, remove = false) {
    if (!hashes.length) return true
    const url = `${API}/api/tags/${encodeURIComponent(tag)}`
    const response = await fetch(url, {
      method: remove ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hashes),
    })
    if (!response.ok) {
      return false
    }
    return true
  }

  async function saveDescription(hash: string, description: string) {
    const current = pageRef.current.items.find(item => item.hash === hash)
    if (!current) return
    if (description === current.description) return
    const response = await fetch(`${API}/api/contents/${hash}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    })
    if (!response.ok) {
      setNotice('Could not save the description.')
      return
    }
    const updatedPage = {
      ...pageRef.current,
      items: pageRef.current.items.map(item => item.hash === hash ? { ...item, description } : item),
    }
    pageRef.current = updatedPage
    setPage(updatedPage)
    setDescriptionDrafts(currentDrafts => {
      if (currentDrafts[hash] !== description) return currentDrafts
      const next = { ...currentDrafts }
      delete next[hash]
      return next
    })
  }

  const visible = page.items
  const selectedCount = contentSelection.mode === 'all'
    ? Math.max(0, page.total - contentSelection.excludedHashes.length)
    : contentSelection.hashes.length
  const allSelected = contentSelection.mode === 'all' && contentSelection.excludedHashes.length === 0

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

  function toggleContentSelection(hash: string) {
    setContentSelection(current => {
      if (current.mode === 'all') {
        const excluded = new Set(current.excludedHashes)
        if (excluded.has(hash)) excluded.delete(hash)
        else excluded.add(hash)
        return { mode: 'all', excludedHashes: [...excluded] }
      }
      const hashes = new Set(current.hashes)
      if (hashes.has(hash)) hashes.delete(hash)
      else hashes.add(hash)
      return { mode: 'some', hashes: [...hashes] }
    })
  }

  function toggleAllContentSelection() {
    setContentSelection(current => current.mode === 'all' && current.excludedHashes.length === 0
      ? { mode: 'some', hashes: [] }
      : { mode: 'all', excludedHashes: [] })
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
    const currentIndex = visible.findIndex(item => item.hash === selectedHash)
    const effectiveIndex = currentIndex < 0 ? 0 : currentIndex
    const next = visible[effectiveIndex + direction]
    if (next) {
      setSelectedHash(next.hash)
      return
    }
    if (direction < 0 || currentPage.items.length >= currentPage.total) return
    if (navigationPending.current) return

    navigationPending.current = true
    try {
      while (pageRef.current.items.length < pageRef.current.total) {
        const batch = await loadNextBatch()
        if (!batch.length) return
        setSelectedHash(batch[0].hash)
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
    const selectedIndex = page.items.findIndex(item => item.hash === selectedHash)
    if (selectedIndex >= 0 && page.items.length - selectedIndex <= 10)
      void loadNextBatch()
  }, [viewMode, loading, page, selectedHash, visible.length, loadNextBatch])

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
  }, [activeTab, viewMode, page, selectedHash, selectedTags])

  const selectedContent = visible.find(item => item.hash === selectedHash) ?? visible[0]

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
          setSelectedHash(visible[0]?.hash ?? '')
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
      allSelected={allSelected}
      isSelected={hash => contentSelection.mode === 'all'
        ? !contentSelection.excludedHashes.includes(hash)
        : contentSelection.hashes.includes(hash)}
      onToggleAll={toggleAllContentSelection}
      onToggle={toggleContentSelection}
      onOpen={item => {
        setSelectedHash(item.hash)
        setViewMode('single')
      }}
      renderDetails={item => <div className="content-details">
          <div className="card-tags">
            {item.tags.map(tag => <button
              key={tag}
              className="tag"
              onClick={() => void updateTag(item.hash, tag, true)}
              title={`Remove ${tag}`}
            >{tag}<span aria-hidden="true"> ×</span></button>)}
            <form onSubmit={event => {
              event.preventDefault()
              const tag = tagDrafts[item.hash]?.trim()
              if (tag) void updateTag(item.hash, tag)
            }}>
              <input
                className="tag-input"
                aria-label={`Add tag to ${item.originalName}`}
                placeholder="Add tag"
                value={tagDrafts[item.hash] ?? ''}
                onChange={event => setTagDrafts(state => ({ ...state, [item.hash]: event.target.value }))}
              />
            </form>
          </div>
        </div>}
      endRef={gridEndRef}
    /> : selectedContent ? <section className="single-content" aria-label="Single content view">
      <header className="single-content-heading">
        <div className="single-content-title">
          <span>{page.items.findIndex(item => item.hash === selectedContent.hash) + 1} of {page.total.toLocaleString()}</span>
        </div>
      </header>
      <div className="single-content-frame">
        {selectedContent.mediaType.startsWith('video/')
          ? <video className="full-content" src={`${API}/api/contents/${selectedContent.hash}/content`} controls preload="metadata" />
          : <img className="full-content" src={`${API}/api/contents/${selectedContent.hash}/content`} alt={selectedContent.originalName} />}
      </div>
      <ContentMetadataEditor
        content={selectedContent}
        allTags={allTags}
        description={descriptionDrafts[selectedContent.hash] ?? selectedContent.description}
        onDescriptionChange={value => setDescriptionDrafts(state => ({ ...state, [selectedContent.hash]: value }))}
        onSaveDescription={saveDescription}
        tagShortcuts={tagShortcuts}
        onShortcutChange={(number, tag) => setTagShortcuts(current => ({ ...current, [number]: tag }))}
        onApplyShortcut={(hash, tag) => { void updateTag(hash, tag) }}
        onAddTag={updateTag}
        onRemoveTag={(hash, tag) => { void updateTag(hash, tag, true) }}
      />
    </section> : <p className="state">No content in this view.</p>}
    </> : <PeriodsView
      contents={visible}
      totalContents={page.total}
      selectedTags={selectedTags}
      onToggleTag={tag => setSelectedTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag])}
      onClearTags={() => setSelectedTags([])}
      availableTags={availableTags}
      allTags={allTags}
      endRef={gridEndRef}
      loadNextBatch={loadNextBatch}
      onTagsChanged={refresh}
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
