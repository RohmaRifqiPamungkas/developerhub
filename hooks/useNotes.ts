'use client'
import { useState, useEffect, useCallback } from 'react'
import { Note } from '@/types'
import { generateId } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

type DbNote = {
  id: string
  title: string
  content: string
  tags: string[]
  pinned: boolean
  color?: string
  created_at: string
  updated_at: string
}

function toNote(row: DbNote): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags ?? [],
    pinned: row.pinned,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase
        .from('notes')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('[useNotes] fetch error:', error)
            setError(error.message)
          } else if (data) {
            setNotes((data as DbNote[]).map(toNote))
          }
          setLoading(false)
        })
    })
  }, [])

  const addNote = useCallback(
    async (data: { title: string; content: string; tags: string[]; color?: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('[useNotes] addNote: no authenticated user')
        return
      }
      const now = new Date().toISOString()
      const id = generateId()
      const optimistic: Note = { ...data, id, pinned: false, createdAt: now, updatedAt: now }
      setNotes((prev) => [optimistic, ...prev])

      const { error } = await supabase.from('notes').insert({
        id,
        user_id: user.id,
        title: data.title,
        content: data.content,
        tags: data.tags,
        pinned: false,
        created_at: now,
        updated_at: now,
      })

      if (error) {
        console.error('[useNotes] insert error:', error)
        setError(error.message)
        setNotes((prev) => prev.filter((n) => n.id !== id))
      }
    },
    []
  )

  const updateNote = useCallback(
    async (id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>) => {
      const updatedAt = new Date().toISOString()
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updates, updatedAt } : n))
      )
      const supabase = createClient()
      const dbPatch: Record<string, unknown> = { updated_at: updatedAt }
      if ('title' in updates) dbPatch.title = updates.title
      if ('content' in updates) dbPatch.content = updates.content
      if ('tags' in updates) dbPatch.tags = updates.tags
      if ('pinned' in updates) dbPatch.pinned = updates.pinned

      const { error } = await supabase.from('notes').update(dbPatch).eq('id', id)
      if (error) console.error('[useNotes] update error:', error)
    },
    []
  )

  const deleteNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    const supabase = createClient()
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) console.error('[useNotes] delete error:', error)
  }, [])

  const togglePin = useCallback(async (id: string) => {
    setNotes((prev) => {
      const note = prev.find((n) => n.id === id)
      if (!note) return prev
      const pinned = !note.pinned
      const supabase = createClient()
      supabase
        .from('notes')
        .update({ pinned, updated_at: new Date().toISOString() })
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[useNotes] togglePin error:', error)
        })
      return prev.map((n) => (n.id === id ? { ...n, pinned } : n))
    })
  }, [])

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return { notes: sortedNotes, loading, error, addNote, updateNote, deleteNote, togglePin }
}
