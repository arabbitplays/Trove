import { useCallback, useEffect, useRef, useState } from 'react'
import ImportPopup from './ImportPopup'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
type ContentItem = { hash: string; originalName: string; addedAt: string; tags: string[] }
type Page = { items: ContentItem[]; total: number; skip: number; take: number }

export default function App() {
  const [page, setPage] = useState<Page>({ items: [], total: 0, skip: 0, take: 48 })
  const [allTags, setAllTags] = useState<string[]>([])
  const [activeTag, setActiveTag] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [importing, setImporting] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [notice, setNotice] = useState('')
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})
  const picker = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async (tag = activeTag) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ skip: '0', take: '100' })
      if (tag) params.set('tag', tag)
      const [contentsResponse, tagsResponse] = await Promise.all([
        fetch(`${API}/api/contents?${params}`),
        fetch(`${API}/api/tags`),
      ])
      if (!contentsResponse.ok || !tagsResponse.ok) throw new Error('Request failed')
      setPage(await contentsResponse.json() as Page)
      setAllTags(await tagsResponse.json() as string[])
    } catch {
      setApiAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [activeTag])

  useEffect(() => { void refresh() }, [refresh])

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

  async function updateTag(hash: string, tag: string, remove = false) {
    const ok = await updateTagForContent([hash], tag, remove)
    if (!ok) {
      setNotice('Could not update this tag.')
      return
    }
    setTagDrafts(current => ({ ...current, [hash]: '' }))
    await refresh()
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

  const visible = page.items.filter(item =>
    !query || `${item.originalName} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  )

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#">Content Manager</a>
      <div className="top-actions">
        <input
          className="search"
          type="search"
          aria-label="Search media"
          placeholder="Search media"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
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
        <button className="button button-primary" onClick={() => picker.current?.click()} disabled={importing}>
          {importing ? 'Importing…' : 'Import folder'}
        </button>
      </div>
    </header>

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

    <section className="library-heading">
      <h1>Library</h1>
      <span>{page.total.toLocaleString()} total</span>
    </section>

    <nav className="filters" aria-label="Filter by tag">
      <button className={`filter ${activeTag === '' ? 'active' : ''}`} onClick={() => setActiveTag('')}>All</button>
      {allTags.map(tag => <button
        key={tag}
        className={`filter ${activeTag === tag ? 'active' : ''}`}
        onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
      >{tag}</button>)}
    </nav>

    {notice && <div className="notice" role="status">
      <span>{notice}</span>
      <button className="text-button" onClick={() => setNotice('')} aria-label="Dismiss message">Dismiss</button>
    </div>}

    {loading ? <p className="state">Loading library…</p> : visible.length === 0 ? <section className="state empty-state">
        <h2>{query || activeTag ? 'No media found' : 'No media yet'}</h2>
        <p>{query || activeTag ? 'Try a different search or filter.' : 'Import a folder to add images and videos to your library.'}</p>
    </section> : <section className="content-grid" aria-label="Media library">
      {visible.map(item => <article className="content-card" key={item.hash}>
        <img className="content-preview" src={`${API}/api/contents/${item.hash}/thumbnail`} alt={item.originalName} loading="lazy" />
        <div className="content-details">
          <div className="filename" title={item.originalName}>{item.originalName}</div>
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
        </div>
      </article>)}
    </section>}

    {!loading && page.total > page.items.length && <button className="button load-more" onClick={() => void loadMore(page, activeTag, setPage)}>
      Load more
    </button>}
  </main>
}

async function loadMore(page: Page, tag: string, setPage: (next: Page | ((current: Page) => Page)) => void) {
  const params = new URLSearchParams({ skip: String(page.items.length), take: '100' })
  if (tag) params.set('tag', tag)
  const response = await fetch(`${API}/api/contents?${params}`)
  if (!response.ok) return
  const next = await response.json() as Page
  setPage(current => ({ ...next, items: [...current.items, ...next.items] }))
}
