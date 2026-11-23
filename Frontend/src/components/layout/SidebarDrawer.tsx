import { useEffect } from 'react'
import { Menu, Moon, Sun, Tags } from 'lucide-react'

type SidebarDrawerProps = {
  mounted: boolean
  open: boolean
  onClose: () => void
  onExited: () => void
  onImportClick: () => void
  importing: boolean
  darkMode: boolean
  onToggleDarkMode: () => void
  onManageTags: () => void
}

export default function SidebarDrawer({
  mounted,
  open,
  onClose,
  onExited,
  onImportClick,
  importing,
  darkMode,
  onToggleDarkMode,
  onManageTags,
}: SidebarDrawerProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div
      className={`sidebar-backdrop ${open ? 'sidebar-open' : ''}`}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside
        className="content-sidebar"
        aria-label="Main menu"
        onTransitionEnd={event => {
          if (event.target === event.currentTarget && !open) onExited()
        }}
      >
        <header className="sidebar-header">
          <h2>Menu</h2>
          <button
            className="button menu-trigger"
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            aria-expanded={open}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </header>
        <button
          className="button button-primary sidebar-import"
          type="button"
          onClick={() => {
            onClose()
            onImportClick()
          }}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Import folder'}
        </button>
        <button
          className="button sidebar-menu-item"
          type="button"
          onClick={() => {
            onClose()
            onManageTags()
          }}
        >
          <Tags size={18} aria-hidden="true" />
          Manage tags
        </button>
        <button
          className="button sidebar-theme-toggle"
          type="button"
          onClick={onToggleDarkMode}
          aria-pressed={darkMode}
        >
          {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          {darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
      </aside>
    </div>
  )
}
