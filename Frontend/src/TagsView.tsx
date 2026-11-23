import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Pencil, Search, Tags, Trash2, X } from 'lucide-react'
import { API } from './config'
import type { TagSummary } from './types'

type TagsViewProps = {
  onBack: () => void
  onTagsChanged: () => void
}

export default function TagsView({ onBack, onTagsChanged }: TagsViewProps) {
  const [tags, setTags] = useState<TagSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadTags() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/tags/overview`)
      if (!response.ok) throw new Error('Could not load tags overview.')
      const data = (await response.json()) as TagSummary[]
      setTags(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load tags.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTags()
  }, [])

  function startRename(tag: TagSummary) {
    if (tag.isAuto) return
    setEditingTag(tag.name)
    setRenameDraft(tag.name)
    setError('')
  }

  function cancelRename() {
    setEditingTag(null)
    setRenameDraft('')
  }

  async function saveRename(oldName: string) {
    const trimmed = renameDraft.trim().toLowerCase()
    if (!trimmed) {
      setError('Tag name cannot be empty.')
      return
    }
    if (trimmed.length > 50 || trimmed.includes('/')) {
      setError('Tag must be 1 to 50 characters and cannot contain slashes.')
      return
    }
    if (trimmed === 'new') {
      setError("The 'new' tag is reserved for automatic assignment.")
      return
    }
    if (trimmed === oldName) {
      cancelRename()
      return
    }

    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/tags/${encodeURIComponent(oldName)}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed }),
      })
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error ?? 'Failed to rename tag.')
      }
      setNotice(`Renamed tag “${oldName}” to “${trimmed}”.`)
      cancelRename()
      await loadTags()
      onTagsChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not rename tag.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteTag(tag: TagSummary) {
    if (tag.isAuto) return
    const confirmed = window.confirm(
      `Are you sure you want to delete the tag “${tag.name}”?\n\nIt will be removed from ${tag.contentCount} ${
        tag.contentCount === 1 ? 'item' : 'items'
      }.`
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${API}/api/tags/${encodeURIComponent(tag.name)}/all`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorData.error ?? 'Failed to delete tag.')
      }
      setNotice(`Deleted tag “${tag.name}”.`)
      await loadTags()
      onTagsChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete tag.')
    } finally {
      setBusy(false)
    }
  }

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(search.trim().toLowerCase())
  )

  const manualCount = tags.filter(tag => !tag.isAuto).length
  const autoCount = tags.filter(tag => tag.isAuto).length

  return (
    <section className="tags-view" aria-label="Tag Management">
      <div className="tags-view-header">
        <div className="tags-view-title-group">
          <button className="button tags-back-button" type="button" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            Back to library
          </button>
          <div>
            <h1>Manage Tags</h1>
            <p className="tags-view-subtitle">
              {tags.length} total tags ({manualCount} custom, {autoCount} automatic)
            </p>
          </div>
        </div>

        <div className="tags-search-wrap">
          <Search size={16} className="tags-search-icon" aria-hidden="true" />
          <input
            className="tags-search-input"
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tags…"
            aria-label="Filter tags by name"
          />
        </div>
      </div>

      {notice && (
        <div className="notice tags-notice" role="status">
          <span>{notice}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => setNotice('')}
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="health-alert tags-alert" role="alert">
          <span>{error}</span>
          <button
            className="text-button"
            type="button"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="state">Loading tags…</p>
      ) : filteredTags.length === 0 ? (
        <div className="state empty-state">
          <h2>No tags found</h2>
          <p>{search ? 'Try clearing your search.' : 'Import media and add tags to get started.'}</p>
        </div>
      ) : (
        <div className="tags-table-container">
          <table className="tags-table">
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Type</th>
                <th scope="col">Usage</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTags.map(tag => {
                const isEditing = editingTag === tag.name
                return (
                  <tr key={tag.name}>
                    <td className="tag-cell-name">
                      {isEditing ? (
                        <form
                          className="tags-inline-edit"
                          onSubmit={e => {
                            e.preventDefault()
                            void saveRename(tag.name)
                          }}
                        >
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={e => setRenameDraft(e.target.value)}
                            disabled={busy}
                            autoFocus
                            aria-label={`New name for ${tag.name}`}
                          />
                          <button
                            className="button button-primary tags-action-button"
                            type="submit"
                            disabled={busy}
                            title="Save new tag name"
                          >
                            <Check size={14} aria-hidden="true" />
                            Save
                          </button>
                          <button
                            className="button tags-action-button"
                            type="button"
                            onClick={cancelRename}
                            disabled={busy}
                            title="Cancel rename"
                          >
                            <X size={14} aria-hidden="true" />
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <span className={`tag ${tag.isAuto ? 'tag-auto' : ''}`}>{tag.name}</span>
                      )}
                    </td>
                    <td>
                      {tag.isAuto ? (
                        <span className="tag-badge-auto" title="Generated from year or status">
                          Auto
                        </span>
                      ) : (
                        <span className="tag-badge-manual">Manual</span>
                      )}
                    </td>
                    <td>
                      <span className="tag-usage-count">
                        {tag.contentCount} {tag.contentCount === 1 ? 'item' : 'items'}
                      </span>
                    </td>
                    <td>
                      {!isEditing && (
                        <div className="tags-actions">
                          <button
                            className="button tags-action-button"
                            type="button"
                            onClick={() => startRename(tag)}
                            disabled={busy || tag.isAuto}
                            title={
                              tag.isAuto ? 'Automatic tags cannot be renamed' : `Rename tag “${tag.name}”`
                            }
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Rename
                          </button>
                          <button
                            className="button tags-action-button tags-delete-button"
                            type="button"
                            onClick={() => void deleteTag(tag)}
                            disabled={busy || tag.isAuto}
                            title={
                              tag.isAuto ? 'Automatic tags cannot be deleted' : `Delete tag “${tag.name}”`
                            }
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
