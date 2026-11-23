import { API } from '../../config'
import type { ContentItem } from '../../types'
import ContentMetadataEditor from '../../ContentMetadataEditor'

type SingleContentViewProps = {
  content: ContentItem
  currentIndex: number
  totalCount: number
  allTags: string[]
  autoTagNames: string[]
  descriptionDraft?: string
  onDescriptionChange: (description: string) => void
  onSaveMetadata: (id: string, description: string, takenAt: string | null) => Promise<boolean>
  tagShortcuts: Record<string, string>
  onShortcutChange: (number: string, tag: string) => void
  onApplyShortcut: (id: string, tag: string) => void
  onAddTag: (id: string, tag: string) => Promise<boolean>
  onRemoveTag: (id: string, tag: string) => void
  className?: string
}

export default function SingleContentView({
  content,
  currentIndex,
  totalCount,
  allTags,
  autoTagNames,
  descriptionDraft,
  onDescriptionChange,
  onSaveMetadata,
  tagShortcuts,
  onShortcutChange,
  onApplyShortcut,
  onAddTag,
  onRemoveTag,
  className = 'single-content',
}: SingleContentViewProps) {
  return (
    <section className={className} aria-label="Single content view">
      <header className="single-content-heading">
        <div className="single-content-title">
          <span>
            {currentIndex + 1} of {totalCount.toLocaleString()}
          </span>
        </div>
      </header>
      <div className="single-content-frame">
        {content.mediaType.startsWith('video/') ? (
          <video
            className="full-content"
            src={`${API}/api/contents/${content.id}/content`}
            controls
            preload="metadata"
          />
        ) : (
          <img
            className="full-content"
            src={`${API}/api/contents/${content.id}/content`}
            alt={content.description || `Content ${content.id.slice(0, 8)}`}
          />
        )}
      </div>
      <ContentMetadataEditor
        content={content}
        allTags={allTags}
        autoTagNames={autoTagNames}
        description={descriptionDraft ?? content.description}
        onDescriptionChange={onDescriptionChange}
        onSaveMetadata={onSaveMetadata}
        tagShortcuts={tagShortcuts}
        onShortcutChange={onShortcutChange}
        onApplyShortcut={onApplyShortcut}
        onAddTag={onAddTag}
        onRemoveTag={onRemoveTag}
      />
    </section>
  )
}
