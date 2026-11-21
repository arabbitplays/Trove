import { useCallback, useEffect, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
type ImageItem = { hash: string; originalName: string; addedAt: string; tags: string[] }
type Page = { items: ImageItem[]; total: number; skip: number; take: number }

export default function App() {
  const [page, setPage] = useState<Page>({ items: [], total: 0, skip: 0, take: 48 })
  const [allTags, setAllTags] = useState<string[]>([])
  const [activeTag, setActiveTag] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})
  const picker = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async (tag = activeTag) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ skip: '0', take: '100' })
      if (tag) params.set('tag', tag)
      const [imagesResponse, tagsResponse] = await Promise.all([
        fetch(`${API}/api/images?${params}`),
        fetch(`${API}/api/tags`),
      ])
      if (!imagesResponse.ok || !tagsResponse.ok) throw new Error('Request failed')
      setPage(await imagesResponse.json() as Page)
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

  async function importFiles(files: FileList | null) {
    if (!files?.length) return
    setImporting(true)
    setNotice('')
    const form = new FormData()
    Array.from(files).forEach(file => form.append('files', file, file.name))
    try {
      const response = await fetch(`${API}/api/import`, { method: 'POST', body: form })
      if (!response.ok) throw new Error('Import failed')
      const result = await response.json() as { imported: number; duplicates: number; errors: string[] }
      setNotice(`Added ${result.imported}; ${result.duplicates} duplicates${result.errors.length ? `; ${result.errors.length} skipped` : ''}.`)
      await refresh()
    } catch {
      setNotice('Import failed. Check the API connection and try again.')
    } finally {
      setImporting(false)
      if (picker.current) picker.current.value = ''
    }
  }

  async function updateTag(hash: string, tag: string, remove = false) {
    const url = `${API}/api/images/${hash}/tags/${encodeURIComponent(tag)}`
    const response = await fetch(url, { method: remove ? 'DELETE' : 'PUT' })
    if (!response.ok) {
      setNotice('Could not update this tag.')
      return
    }
    setTagDrafts(current => ({ ...current, [hash]: '' }))
    await refresh()
  }

  const visible = page.items.filter(item =>
    !query || `${item.originalName} ${item.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  )

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#">Image Manager</a>
      <div className="top-actions">
        <input
          className="search"
          type="search"
          aria-label="Search images"
          placeholder="Search images"
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
          accept="image/*"
          onChange={event => void importFiles(event.target.files)}
        />
        <button className="button button-primary" onClick={() => picker.current?.click()} disabled={importing}>
          {importing ? 'Importing…' : 'Import folder'}
        </button>
      </div>
    </header>

    {apiAvailable === false && <div className="health-alert" role="alert">
      API or database unavailable. Check that the backend and PostgreSQL are running.
    </div>}

    <section className="library-heading">
      <h1>Images</h1>
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

    {loading ? <p className="state">Loading images…</p> : visible.length === 0 ? <section className="state empty-state">
      <h2>{query || activeTag ? 'No images found' : 'No images yet'}</h2>
      <p>{query || activeTag ? 'Try a different search or filter.' : 'Import a folder to add images to your library.'}</p>
    </section> : <section className="image-grid" aria-label="Image library">
      {visible.map(item => <article className="image-card" key={item.hash}>
        <img className="image" src={`${API}/api/images/${item.hash}/content`} alt={item.originalName} loading="lazy" />
        <div className="image-details">
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
  const response = await fetch(`${API}/api/images?${params}`)
  if (!response.ok) return
  const next = await response.json() as Page
  setPage(current => ({ ...next, items: [...current.items, ...next.items] }))
}
