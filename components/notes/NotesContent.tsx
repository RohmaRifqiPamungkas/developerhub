'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Pin, Trash2, Edit3, Tag, X, StickyNote,
  Bold, Italic, List, ListOrdered, CheckSquare, Eye, AlertTriangle,
} from 'lucide-react'
import { useNotes } from '@/hooks/useNotes'
import { Note } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

// ─── Markdown helpers (shared with TodoContent) ───────────────────────────────

function renderInlineMarkdown(text: string) {
  const regex = /(\*\*.*?\*\*|\*.*?\*)/g
  const tokens = text.split(regex)
  return tokens.map((token, i) => {
    if (token.startsWith('**') && token.endsWith('**'))
      return <strong key={i} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>
    if (token.startsWith('*') && token.endsWith('*'))
      return <em key={i} className="italic text-foreground">{token.slice(1, -1)}</em>
    return token
  })
}

function parseMarkdown(text: string, onToggleTodo?: (lineIndex: number, checked: boolean) => void) {
  if (!text) return null
  const lines = text.split('\n')
  const parsedElements: React.ReactNode[] = []
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null

  const flushList = (key: string | number) => {
    if (currentList) {
      if (currentList.type === 'ul') {
        parsedElements.push(<ul key={`ul-${key}`} className="list-disc pl-5 my-1.5 space-y-1">{currentList.items}</ul>)
      } else {
        parsedElements.push(<ol key={`ol-${key}`} className="list-decimal pl-5 my-1.5 space-y-1">{currentList.items}</ol>)
      }
      currentList = null
    }
  }

  lines.forEach((line, idx) => {
    const checklistMatch = line.match(/^-\s+\[([ xX])\]\s+(.*)/)
    if (checklistMatch) {
      flushList(idx)
      const checked = checklistMatch[1].toLowerCase() === 'x'
      const content = checklistMatch[2]
      parsedElements.push(
        <div key={`check-${idx}`} className="flex items-start gap-2 my-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggleTodo?.(idx, e.target.checked)}
            disabled={!onToggleTodo}
            className="rounded border-border text-primary focus:ring-0 w-4 h-4 mt-0.5 cursor-pointer disabled:cursor-default"
          />
          <span
            onClick={() => onToggleTodo?.(idx, !checked)}
            className={cn(
              'text-sm text-foreground select-none',
              checked && 'line-through text-muted-foreground/60',
              onToggleTodo && 'cursor-pointer hover:text-primary transition-colors'
            )}
          >
            {renderInlineMarkdown(content)}
          </span>
        </div>
      )
      return
    }

    const bulletMatch = line.match(/^-\s+(.*)/)
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'ul') { flushList(idx); currentList = { type: 'ul', items: [] } }
      currentList.items.push(<li key={`li-${idx}`} className="text-sm text-foreground leading-relaxed">{renderInlineMarkdown(bulletMatch[1])}</li>)
      return
    }

    const numberMatch = line.match(/^(\d+)\.\s+(.*)/)
    if (numberMatch) {
      if (!currentList || currentList.type !== 'ol') { flushList(idx); currentList = { type: 'ol', items: [] } }
      currentList.items.push(<li key={`li-${idx}`} className="text-sm text-foreground leading-relaxed" value={parseInt(numberMatch[1], 10)}>{renderInlineMarkdown(numberMatch[2])}</li>)
      return
    }

    flushList(idx)
    if (line.trim() === '') {
      parsedElements.push(<div key={`empty-${idx}`} className="h-2" />)
    } else {
      parsedElements.push(
        <p key={`p-${idx}`} className="text-sm text-foreground leading-relaxed min-h-[1rem]">
          {renderInlineMarkdown(line)}
        </p>
      )
    }
  })

  flushList('final')
  return <div className="space-y-1">{parsedElements}</div>
}

// ─── Note color presets ───────────────────────────────────────────────────────

const NOTE_COLORS: { label: string; value: string; bg: string; border: string; accent: string }[] = [
  { label: 'Default',  value: 'default',  bg: '',                      border: 'border-border',         accent: '' },
  { label: 'Rose',     value: 'rose',     bg: 'bg-rose-500/5',         border: 'border-rose-500/25',    accent: 'bg-rose-500' },
  { label: 'Orange',   value: 'orange',   bg: 'bg-orange-500/5',       border: 'border-orange-500/25',  accent: 'bg-orange-500' },
  { label: 'Amber',    value: 'amber',    bg: 'bg-amber-500/5',        border: 'border-amber-500/25',   accent: 'bg-amber-500' },
  { label: 'Emerald',  value: 'emerald',  bg: 'bg-emerald-500/5',      border: 'border-emerald-500/25', accent: 'bg-emerald-500' },
  { label: 'Sky',      value: 'sky',      bg: 'bg-sky-500/5',          border: 'border-sky-500/25',     accent: 'bg-sky-500' },
  { label: 'Violet',   value: 'violet',   bg: 'bg-violet-500/5',       border: 'border-violet-500/25',  accent: 'bg-violet-500' },
  { label: 'Pink',     value: 'pink',     bg: 'bg-pink-500/5',         border: 'border-pink-500/25',    accent: 'bg-pink-500' },
]

function getNoteColor(value?: string) {
  return NOTE_COLORS.find((c) => c.value === value) ?? NOTE_COLORS[0]
}

// ─── Markdown editor (Write / Preview) ───────────────────────────────────────

function NoteDescriptionEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')

  const insertFormatting = (prefix: string, suffix = '') => {
    const textarea = document.getElementById('note-content-textarea') as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.substring(start, end)
    const replacement = prefix + (selected || '') + suffix
    const newValue = text.substring(0, start) + replacement + text.substring(end)
    onChange(newValue)
    setTimeout(() => {
      textarea.focus()
      const pos = start + prefix.length + selected.length + suffix.length
      textarea.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const textarea = e.currentTarget
      const val = textarea.value
      const start = textarea.selectionStart
      const beforeCursor = val.substring(0, start)
      const lineStartIdx = beforeCursor.lastIndexOf('\n') + 1
      const currentLine = beforeCursor.substring(lineStartIdx)

      const checklistMatch = currentLine.match(/^-\s+\[([ xX])\]\s*(.*)/)
      const bulletMatch = currentLine.match(/^-\s+(.*)/)
      const numberMatch = currentLine.match(/^(\d+)\.\s*(.*)/)

      if (checklistMatch) {
        e.preventDefault()
        const content = checklistMatch[2]
        if (content.trim() === '') {
          const newValue = val.substring(0, lineStartIdx) + val.substring(start)
          onChange(newValue)
          setTimeout(() => textarea.setSelectionRange(lineStartIdx, lineStartIdx), 0)
        } else {
          const prefix = '\n- [ ] '
          const newValue = val.substring(0, start) + prefix + val.substring(start)
          onChange(newValue)
          setTimeout(() => textarea.setSelectionRange(start + prefix.length, start + prefix.length), 0)
        }
        return
      }

      if (bulletMatch) {
        e.preventDefault()
        const content = bulletMatch[1]
        if (content.trim() === '') {
          const newValue = val.substring(0, lineStartIdx) + val.substring(start)
          onChange(newValue)
          setTimeout(() => textarea.setSelectionRange(lineStartIdx, lineStartIdx), 0)
        } else {
          const prefix = '\n- '
          const newValue = val.substring(0, start) + prefix + val.substring(start)
          onChange(newValue)
          setTimeout(() => textarea.setSelectionRange(start + prefix.length, start + prefix.length), 0)
        }
        return
      }

      if (numberMatch) {
        e.preventDefault()
        const num = parseInt(numberMatch[1], 10)
        const content = numberMatch[2]
        if (content.trim() === '') {
          const newValue = val.substring(0, lineStartIdx) + val.substring(start)
          onChange(newValue)
          setTimeout(() => textarea.setSelectionRange(lineStartIdx, lineStartIdx), 0)
        } else {
          const prefix = `\n${num + 1}. `
          const newValue = val.substring(0, start) + prefix + val.substring(start)
          onChange(newValue)
          setTimeout(() => textarea.setSelectionRange(start + prefix.length, start + prefix.length), 0)
        }
        return
      }
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden resize-y min-h-[160px] h-[260px]">
      {/* Tab bar + toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5 flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('write')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer',
              activeTab === 'write' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer',
              activeTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Preview
          </button>
        </div>

        {activeTab === 'write' && (
          <div className="flex items-center gap-0.5 border-l border-border/60 pl-2">
            <button type="button" title="Bold" onClick={() => insertFormatting('**', '**')}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button type="button" title="Italic" onClick={() => insertFormatting('*', '*')}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button type="button" title="Bullet List" onClick={() => insertFormatting('- ')}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <List className="w-3.5 h-3.5" />
            </button>
            <button type="button" title="Numbered List" onClick={() => insertFormatting('1. ')}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button type="button" title="Checklist" onClick={() => insertFormatting('- [ ] ')}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 flex">
        {activeTab === 'write' ? (
          <textarea
            id="note-content-textarea"
            placeholder="Write your note... Supports **bold**, *italic*, - bullet, 1. numbered, - [ ] checklist"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 w-full h-full p-3 text-sm bg-transparent border-none focus-visible:ring-0 focus-visible:outline-none resize-none overflow-y-auto text-foreground"
          />
        ) : (
          <div className="flex-1 p-3.5 h-full bg-muted/10 overflow-y-auto">
            {value.trim() ? (
              parseMarkdown(value)
            ) : (
              <p className="text-sm text-muted-foreground italic">Nothing to preview.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Note form data ───────────────────────────────────────────────────────────

interface NoteFormData {
  title: string
  content: string
  tags: string[]
  color: string
}

// ─── NoteDialog (create / edit) ───────────────────────────────────────────────

function NoteDialog({
  open, onClose, onSave, initial, allTags,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: NoteFormData) => void
  initial?: Note | null
  allTags: string[]
}) {
  const [form, setForm] = useState<Omit<NoteFormData, 'tags'>>({
    title: '', content: '', color: 'default',
  })
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState('')

  // Sync form whenever dialog opens
  useState(() => {
    if (open) {
      setForm(
        initial
          ? { title: initial.title, content: initial.content, color: initial.color ?? 'default' }
          : { title: '', content: '', color: 'default' }
      )
      setSelectedTags(initial ? initial.tags : [])
      setNewTagInput('')
    }
  })

  // Keep form in sync when `open` or `initial` change
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setForm(
        initial
          ? { title: initial.title, content: initial.content, color: initial.color ?? 'default' }
          : { title: '', content: '', color: 'default' }
      )
      setSelectedTags(initial ? initial.tags : [])
      setNewTagInput('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle>{initial ? 'Edit Note' : 'New Note'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <div className="grid gap-1.5">
            <Label>Title *</Label>
            <Input
              placeholder="Note title..."
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Content — markdown editor */}
          <div className="grid gap-1.5">
            <Label>Content</Label>
            <NoteDescriptionEditor
              value={form.content}
              onChange={(v) => setForm((f) => ({ ...f, content: v }))}
            />
          </div>

          {/* Tags Section */}
          <div className="grid gap-2">
            <Label>Tags</Label>

            {/* Selected Tags list */}
            {selectedTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-dashed border-border bg-muted/20 min-h-[40px] items-center">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/25"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
                      className="hover:bg-primary/20 rounded-full p-0.5 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic px-1">No tags selected</p>
            )}

            {/* Input to add a new tag */}
            <div className="flex gap-2">
              <Input
                placeholder="Type a new tag name..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const cleanTag = newTagInput.trim().toLowerCase()
                    if (cleanTag && !selectedTags.includes(cleanTag)) {
                      setSelectedTags((prev) => [...prev, cleanTag])
                      setNewTagInput('')
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const cleanTag = newTagInput.trim().toLowerCase()
                  if (cleanTag && !selectedTags.includes(cleanTag)) {
                    setSelectedTags((prev) => [...prev, cleanTag])
                    setNewTagInput('')
                  }
                }}
              >
                Add
              </Button>
            </div>

            {/* Existing tags to select from */}
            {allTags.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                  Or select existing tags:
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                  {allTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedTags((prev) => prev.filter((t) => t !== tag))
                          } else {
                            setSelectedTags((prev) => [...prev, tag])
                          }
                        }}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                        )}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2 flex-row justify-end shrink-0 bg-muted/10">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (form.title.trim()) {
                onSave({
                  title: form.title,
                  content: form.content,
                  tags: selectedTags,
                  color: form.color,
                })
                onClose()
              }
            }}
          >
            {initial ? 'Save Changes' : 'Add Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({
  open, onClose, onConfirm, noteTitle,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  noteTitle: string
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            Delete Note
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-foreground">"{noteTitle}"</span>?
            This action cannot be undone.
          </p>
        </div>
        <DialogFooter className="gap-2 flex-row justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => { onConfirm(); onClose() }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Note Read Dialog ─────────────────────────────────────────────────────────

function NoteReadDialog({
  note, open, onClose, onEdit,
}: {
  note: Note | null
  open: boolean
  onClose: () => void
  onEdit: () => void
}) {
  if (!note) return null
  const color = getNoteColor(note.color)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(
        'w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden',
        color.bg, color.border, 'border'
      )}>
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              {color.value !== 'default' && (
                <span className={cn('w-3 h-3 rounded-full shrink-0 mt-1', color.accent)} />
              )}
              <DialogTitle className="text-xl font-bold leading-snug">{note.title}</DialogTitle>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => { onClose(); onEdit() }}>
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </Button>
          </div>
          <div className="flex items-center gap-3 mt-2 pl-5">
            {note.pinned && (
              <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                <Pin className="w-3 h-3" /> Pinned
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              Updated {format(new Date(note.updatedAt), 'MMM d, yyyy · HH:mm')}
            </span>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {note.content ? (
            <div className="prose-sm text-foreground leading-relaxed">
              {parseMarkdown(note.content)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No content.</p>
          )}
        </div>

        {note.tags.length > 0 && (
          <div className="px-6 py-3 border-t border-border/40 flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                <Tag className="w-2.5 h-2.5" />{tag}
              </span>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note, onEdit, onDelete, onPin, onView,
}: {
  note: Note
  onEdit: () => void
  onDelete: () => void
  onPin: () => void
  onView: () => void
}) {
  const color = getNoteColor(note.color)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        'group rounded-xl border p-4 flex flex-col gap-2 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        color.bg || 'bg-card',
        color.border,
        color.value !== 'default' && 'border-l-4',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className="font-medium text-sm text-foreground line-clamp-1 flex-1 cursor-pointer hover:text-primary transition-colors"
          onClick={onView}
        >
          {note.title}
        </h3>
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onPin}
            className={cn(
              'p-1 rounded hover:bg-muted transition-colors cursor-pointer',
              note.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onView}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="View"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Edit"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {note.pinned && (
          <Pin className={cn('w-3.5 h-3.5 text-primary shrink-0', 'group-hover:hidden')} />
        )}
      </div>

      {/* Content preview — click to open read dialog */}
      {note.content && (
        <p
          className="text-xs text-muted-foreground line-clamp-3 flex-1 leading-relaxed cursor-pointer hover:text-foreground/70 transition-colors"
          onClick={onView}
        >
          {/* Strip markdown symbols for plain preview */}
          {note.content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/^[-\d.]+\s+(\[[ x]\]\s+)?/gm, '')}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="flex flex-wrap gap-1">
          {note.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              <Tag className="w-2.5 h-2.5" />{tag}
            </span>
          ))}
          {note.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground px-1">+{note.tags.length - 3}</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {format(new Date(note.updatedAt), 'MMM d')}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Main NotesContent ────────────────────────────────────────────────────────

export function NotesContent() {
  const { notes, addNote, updateNote, deleteNote, togglePin } = useNotes()
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState<string | null>(null)

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editNote, setEditNote] = useState<Note | null>(null)
  const [readNote, setReadNote] = useState<Note | null>(null)
  const [readOpen, setReadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)))

  const filtered = notes.filter((n) => {
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.content.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTag && !n.tags.includes(filterTag)) return false
    return true
  })

  const handleEdit = (note: Note) => {
    setReadOpen(false)
    setEditNote(note)
    setDialogOpen(true)
  }

  const handleDeleteRequest = (note: Note) => {
    setDeleteTarget(note)
    setDeleteOpen(true)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 mb-6 sm:mb-8"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Quick Notes</h1>
          <p className="text-sm text-muted-foreground mt-1">Capture ideas, meeting notes, and more.</p>
        </div>
        <Button
          onClick={() => { setEditNote(null); setDialogOpen(true) }}
          className="gap-2 shrink-0"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Note</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </motion.div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilterTag(null)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer',
              !filterTag
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer',
                filterTag === tag
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <Tag className="w-3 h-3" /> {tag}
            </button>
          ))}
        </div>
      )}

      {/* Notes grid */}
      {filtered.length > 0 ? (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onView={() => { setReadNote(note); setReadOpen(true) }}
                onEdit={() => handleEdit(note)}
                onDelete={() => handleDeleteRequest(note)}
                onPin={() => togglePin(note.id)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground"
        >
          <StickyNote className="w-12 h-12 opacity-20" />
          <p className="text-sm">No notes found</p>
          <Button variant="ghost" size="sm" onClick={() => { setEditNote(null); setDialogOpen(true) }}>
            + Create your first note
          </Button>
        </motion.div>
      )}

      {/* Create / Edit Dialog */}
      <NoteDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditNote(null) }}
        initial={editNote}
        allTags={allTags}
        onSave={(data) => {
          if (editNote) {
            updateNote(editNote.id, { title: data.title, content: data.content, tags: data.tags, color: data.color })
          } else {
            addNote({ title: data.title, content: data.content, tags: data.tags, color: data.color })
          }
        }}
      />

      {/* Read-only Dialog */}
      <NoteReadDialog
        note={readNote}
        open={readOpen}
        onClose={() => setReadOpen(false)}
        onEdit={() => readNote && handleEdit(readNote)}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteTarget(null) }}
        noteTitle={deleteTarget?.title ?? ''}
        onConfirm={() => {
          if (deleteTarget) deleteNote(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
