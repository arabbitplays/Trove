import { type RefObject } from 'react'
import { Menu } from 'lucide-react'

type TopBarProps = {
  activeTab: 'content' | 'periods' | 'tags' | 'garbage'
  onSelectTab: (tab: 'content' | 'periods' | 'tags' | 'garbage') => void
  sidebarOpen: boolean
  onOpenSidebar: () => void
  fileInputRef: RefObject<HTMLInputElement>
  onFilesSelected: (files: File[]) => void
}

export default function TopBar({
  activeTab,
  onSelectTab,
  sidebarOpen,
  onOpenSidebar,
  fileInputRef,
  onFilesSelected,
}: TopBarProps) {
  return (
    <header className="topbar">
      <a className="brand" href="#">
        Trove
      </a>
      <nav className="header-tabs" aria-label="Main sections">
        <button
          className={`header-tab ${activeTab === 'content' ? 'active' : ''}`}
          type="button"
          onClick={() => onSelectTab('content')}
          aria-current={activeTab === 'content' ? 'page' : undefined}
        >
          Content
        </button>
        <button
          className={`header-tab ${activeTab === 'periods' ? 'active' : ''}`}
          type="button"
          onClick={() => onSelectTab('periods')}
          aria-current={activeTab === 'periods' ? 'page' : undefined}
        >
          Periods
        </button>
      </nav>
      <div className="top-actions">
        <input
          ref={element => {
            if (fileInputRef) {
              ;(fileInputRef as React.MutableRefObject<HTMLInputElement | null>).current = element
            }
            element?.setAttribute('webkitdirectory', '')
          }}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={event => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) onFilesSelected(files)
            event.currentTarget.value = ''
          }}
        />
        <button
          className="button menu-trigger"
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
