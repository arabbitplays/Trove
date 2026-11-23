import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, RotateCcw } from 'lucide-react'
import { API, formatDate } from './config'
import type { DeletedContentItem } from './types'

type GarbageViewProps = {
  onBack: () => void
  onRestored: () => void
}

export default function GarbageView({ onBack, onRestored }: GarbageViewProps) {
  const [items, setItems] = useState<DeletedContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyIds, setBusyIds] = useState<string[]>([])

  async function loadGarbage() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/garbage`)
      if (!response.ok) throw new Error('Could not load the garbage bin.')
      setItems((await response.json()) as DeletedContentItem[])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the garbage bin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadGarbage()
  }, [])

  async function restore(item: DeletedContentItem) {
    setBusyIds(current => [...current, item.id])
    setError('')
    setNotice('')
    try {
      const response = await fetch(`${API}/api/garbage/${item.id}/restore`, { method: 'POST' })
      if (!response.ok) throw new Error('Could not restore this image.')
      setNotice(`Restored ${titleFor(item)}.`)
      await loadGarbage()
      onRestored()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore this image.')
    } finally {
      setBusyIds(current => current.filter(id => id !== item.id))
    }
  }

  return (
    <section className="garbage-view" aria-label="Garbage Bin">
      <div className="tags-view-header">
        <div className="tags-view-title-group">
          <button className="button tags-back-button" type="button" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to library
          </button>
          <div>
            <h1>Garbage Bin</h1>
            <p className="tags-view-subtitle">
              {items.length} deleted {items.length === 1 ? 'image' : 'images'} · permanently removed after 30 days
            </p>
          </div>
        </div>
        <button className="button garbage-refresh" type="button" onClick={() => void loadGarbage()} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {notice && (
        <div className="notice tags-notice" role="status">
          <span>{notice}</span>
          <button className="text-button" type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="health-alert tags-alert" role="alert">
          <span>{error}</span>
          <button className="text-button" type="button" onClick={() => setError('')} aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="state">Loading garbage bin…</p>
      ) : items.length === 0 ? (
        <section className="state empty-state">
          <h2>Garbage bin is empty</h2>
          <p>Deleted images will appear here until they are restored or permanently removed.</p>
        </section>
      ) : (
        <div className="content-grid garbage-grid">
          {items.map(item => (
            <article className="garbage-card" key={item.id}>
              <div className="garbage-thumb-wrap">
                <img
                  className="content-preview"
                  src={`${API}/api/contents/${item.id}/thumbnail`}
                  alt=""
                  loading="lazy"
                  onError={event => {
                    event.currentTarget.hidden = true
                  }}
                />
                {item.mediaType.startsWith('video/') && <span className="garbage-media-badge">Video</span>}
              </div>
              <div className="garbage-card-info">
                <strong title={titleFor(item)}>{titleFor(item)}</strong>
                <span>Deleted {new Date(item.deletedAt).toLocaleString()}</span>
                <div className="card-tags">
                  {item.tags.map(tag => (
                    <span className="tag" key={`tag-${tag}`}>
                      {tag}
                    </span>
                  ))}
                  {item.autoTags.map(tag => (
                    <span className="tag tag-auto" key={`auto-${tag}`}>
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  className="button button-primary garbage-restore"
                  type="button"
                  onClick={() => void restore(item)}
                  disabled={busyIds.includes(item.id)}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {busyIds.includes(item.id) ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function titleFor(item: DeletedContentItem): string {
  return item.description.trim() || (item.takenAt ? formatDate(item.takenAt) : 'Untitled image')
}
