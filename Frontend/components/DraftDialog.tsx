// DraftDialog.tsx - With Mini Calendar Preview
'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { 
  Calendar, 
  Send, 
  Trash2, 
  X, 
  FileText, 
  Image as ImageIcon, 
  File,
  Clock,
  MapPin,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink
} from 'lucide-react'
import MessageCard from './MessageCard'
import type { ThreadMessage, CalendarEvent } from '@/lib/type'
import type { Draft } from './DraftList'
import { cn } from '@/lib/utils'
import { isSameDay, format } from 'date-fns'
import { th } from 'date-fns/locale'

interface AttachmentFile {
  url: string
  name: string
  size: number
  type: string
}

// ✅ Helper: แสดง icon ตามประเภทไฟล์
function AttachmentIcon({ type }: { type: string }) {
  if (type.startsWith('image/')) return <ImageIcon className="w-3 h-3 text-blue-500" />
  if (type === 'application/pdf') return <FileText className="w-3 h-3 text-red-500" />
  return <File className="w-3 h-3 text-slate-500" />
}

// ✅ Helper: แปลง bytes เป็น KB/MB
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DraftDialog({
  open,
  onOpenChange,
  draft,
  onUpdateDraft,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  draft: Draft
  onUpdateDraft: (id: string, newStatus: string) => void
}) {
  const [messages, setMessages] = React.useState<ThreadMessage[]>([])
  const [editingText, setEditingText] = React.useState(draft.draftReply)
  const [actionLoading, setActionLoading] = React.useState<'send' | 'reject' | null>(null)
  const [attachments, setAttachments] = React.useState<AttachmentFile[]>([])
  const isUploading = false

  // Calendar State
  const [calendarEvents, setCalendarEvents] = React.useState<CalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = React.useState(false)
  const [showCalendarPreview, setShowCalendarPreview] = React.useState(true)

  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

  React.useEffect(() => {
    if (open) {
      setEditingText(draft.draftReply)
      setAttachments([])
      setActionLoading(null)
      setShowCalendarPreview(true)
    }
  }, [open, draft])

  // โหลด Thread ข้อความ
  React.useEffect(() => {
    if (!open || !draft.threadId) return
    const controller = new AbortController()

    const loadThread = async () => {
      try {
        const token = localStorage.getItem('app_token')
        const res = await fetch(`${API_BASE}/api/threads/${draft.threadId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!controller.signal.aborted) setMessages(data.items ?? [])
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          console.error('Failed to load thread:', e)
        }
      }
    }

    loadThread()
    return () => controller.abort()
  }, [open, draft.threadId, API_BASE])

  // โหลด Calendar Events เพื่อแสดงใน Mini Calendar
  React.useEffect(() => {
    if (!open) return
    let isMounted = true

    const loadCalendar = async () => {
      try {
        setCalendarLoading(true)
        const token = localStorage.getItem('app_token')
        const res = await fetch(`${API_BASE}/api/calendar`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok && isMounted) {
          const data = await res.json()
          setCalendarEvents(data.items || [])
        }
      } catch (e) {
        console.error('Failed to load calendar events for preview:', e)
      } finally {
        if (isMounted) setCalendarLoading(false)
      }
    }

    loadCalendar()
    return () => {
      isMounted = false
    }
  }, [open, API_BASE])

  const handleAction = async (action: 'send' | 'reject') => {
    setActionLoading(action)
    try {
      const token = localStorage.getItem('app_token')
      const res = await fetch(`${API_BASE}/api/drafts/${draft.id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:
          action === 'send'
            ? JSON.stringify({ editedReply: editingText, attachments })
            : undefined,
      })

      if (res.ok) {
        onUpdateDraft(draft.id, action === 'send' ? 'APPROVED' : 'REJECTED')
        onOpenChange(false)
      } else {
        const err = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }))
        alert(err.error || 'เกิดข้อผิดพลาดในการดำเนินการ')
      }
    } catch {
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    } finally {
      setActionLoading(null)
    }
  }

  const removeAttachment = (fileUrl: string) => {
    setAttachments((prev) => prev.filter((a) => a.url !== fileUrl))
  }

  const main = messages.find((m) => m.id === draft.messageId) ?? messages.at(-1)
  const rest = messages.filter((m) => m.id !== main?.id)
  const isSendDisabled = !!actionLoading || isUploading || !editingText.trim()

  // คำนวณวันและนัดหมายในวันดังกล่าวสำหรับ Mini Calendar Preview
  const suggestedDateObj = draft.suggestedDate ? new Date(draft.suggestedDate) : null
  const targetDate = suggestedDateObj || new Date()

  const sameDayEvents = calendarEvents.filter((ev) => {
    const d = ev.start ? new Date(ev.start) : ev.end ? new Date(ev.end) : null
    return d ? isSameDay(d, targetDate) : false
  })

  // ตรวจสอบว่าชนกับนัดเดิมไหม
  const hasConflict =
    suggestedDateObj &&
    sameDayEvents.some((ev) => {
      const evStart = new Date(ev.start || '')
      const evEnd = new Date(ev.end || '')
      const slotStart = suggestedDateObj
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000)
      return slotStart < evEnd && slotEnd > evStart
    })

  const fmtTimeOnly = (dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl p-0 overflow-hidden rounded-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b bg-muted/30">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold line-clamp-2">
                Re: {draft.subject || 'ไม่มีหัวข้อ'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-3 mt-1">
                {draft.suggestedDate ? (
                  <span className="flex items-center gap-1.5 text-blue-700 font-semibold bg-blue-50 border border-blue-200/60 px-2.5 py-1 rounded-lg">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    {new Date(draft.suggestedDate).toLocaleString('th-TH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}{' '}
                    น.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-700 font-semibold bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    ไม่ได้ระบุเวลาแน่ชัด (ขอเลื่อน/นัดเวลา)
                  </span>
                )}

                {draft.location && (
                  <span className="flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md font-medium truncate max-w-[200px]">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {draft.location}
                  </span>
                )}

                {draft.priority && (
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider',
                      draft.priority === 'HIGH'
                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                        : draft.priority === 'LOW'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                    )}
                  >
                    {draft.priority}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50/50">
          <div className="p-6 space-y-6">
            {/* 📅 MINI CALENDAR PREVIEW CARD */}
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
              <div
                onClick={() => setShowCalendarPreview(!showCalendarPreview)}
                className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span>ตารางนัดหมายของ {format(targetDate, 'd MMMM yyyy', { locale: th })}</span>
                      {hasConflict ? (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> มีนัดซ้อนทับ
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> เวลาว่าง
                        </span>
                      )}
                    </h4>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                    {sameDayEvents.length} นัดหมายในวันนี้
                  </span>
                  <button className="text-slate-400 hover:text-slate-600 p-1">
                    {showCalendarPreview ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {showCalendarPreview && (
                <div className="p-4 space-y-3 bg-white animate-in fade-in slide-in-from-top-1">
                  {/* แสดง Slot นัดหมายใหม่ที่กำลังพิจารณา */}
                  {suggestedDateObj && (
                    <div className={cn(
                      "p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2",
                      hasConflict
                        ? "bg-rose-50/70 border-rose-200 text-rose-900"
                        : "bg-blue-50/70 border-blue-200 text-blue-900"
                    )}>
                      <div className="flex items-start sm:items-center gap-2.5">
                        <div className={cn(
                          "w-2 h-2 rounded-full mt-1.5 sm:mt-0 shrink-0",
                          hasConflict ? "bg-rose-500 animate-ping" : "bg-blue-600"
                        )} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/80 border text-blue-800">
                              คำขอนัดหมายใหม่นี้
                            </span>
                            <span className="text-xs font-bold">{draft.subject || 'นัดหมาย'}</span>
                          </div>
                          {draft.location && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3" /> {draft.location}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-xs font-bold shrink-0 self-end sm:self-auto bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                        🕒 {fmtTimeOnly(draft.suggestedDate)} -{' '}
                        {fmtTimeOnly(
                          new Date(
                            suggestedDateObj.getTime() + 60 * 60 * 1000
                          ).toISOString()
                        )}{' '}
                        น.
                      </div>
                    </div>
                  )}

                  {/* รายการกิจกรรมเดิมในวันดังกล่าว */}
                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      นัดหมายอื่นที่มีอยู่แล้วในวันนี้:
                    </span>

                    {calendarLoading ? (
                      <p className="text-xs text-slate-400 animate-pulse py-2">
                        กำลังตรวจสอบปฏิทิน Google Calendar...
                      </p>
                    ) : sameDayEvents.length === 0 ? (
                      <div className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                        <span className="text-xs text-slate-500 font-medium">
                          ✨ ไม่มีนัดหมายอื่นในวันนี้ ตารางเวลาเปิดว่างตลอดทั้งวัน
                        </span>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sameDayEvents.map((ev) => {
                          const isOverlap =
                            suggestedDateObj &&
                            (() => {
                              const evStart = new Date(ev.start || '')
                              const evEnd = new Date(ev.end || '')
                              const slotStart = suggestedDateObj
                              const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000)
                              return slotStart < evEnd && slotEnd > evStart
                            })()

                          return (
                            <div
                              key={ev.id}
                              className={cn(
                                'p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1 transition-all',
                                isOverlap
                                  ? 'bg-rose-50 border-rose-200 text-rose-900 font-medium ring-1 ring-rose-300'
                                  : 'bg-slate-50/70 border-slate-200 text-slate-700'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold truncate">{ev.summary}</span>
                                {isOverlap && (
                                  <span className="text-[9px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded">
                                    ชนเวลา
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {fmtTimeOnly(ev.start)} – {fmtTimeOnly(ev.end)} น.
                                </span>
                                {ev.htmlLink && (
                                  <a
                                    href={ev.htmlLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-0.5"
                                  >
                                    เปิด <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Conversation Thread */}
            {main && <MessageCard message={main} isMain={true} />}
            {rest.length > 0 && (
              <div className="pt-2 space-y-4">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-2">
                  Conversation Thread
                </div>
                {rest.map((m) => (
                  <MessageCard key={m.id} message={m} />
                ))}
              </div>
            )}
          </div>

          {/* Footer: Reply area or Status */}
          {draft.status === 'PENDING' ? (
            <div className="sticky bottom-0 border-t bg-white p-6 space-y-4 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-blue-700 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  ข้อความตอบกลับที่ AI จัดเตรียมไว้ (แก้ไขได้)
                </span>
              </div>

              <Textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className="min-h-[160px] font-sans text-base leading-relaxed bg-slate-50 p-4 border-slate-200 focus:bg-white transition-colors"
                placeholder="พิมพ์ข้อความตอบกลับที่นี่..."
              />

              {/* ✅ Attachment list พร้อม icon + ขนาดไฟล์ */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-1">
                  {attachments.map((file, idx) => (
                    <div
                      key={`${file.url}-${idx}`}
                      className="flex items-center gap-2 bg-slate-100/80 hover:bg-slate-100 px-3 py-1.5 rounded-full text-xs border border-slate-200 transition-colors group"
                    >
                      <AttachmentIcon type={file.type} />
                      <span className="max-w-[150px] truncate font-medium text-slate-700">
                        {file.name}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        onClick={() => removeAttachment(file.url)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-0.5 opacity-0 group-hover:opacity-100"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={() => handleAction('reject')}
                  disabled={!!actionLoading}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {actionLoading === 'reject' ? 'กำลังลบ...' : 'ลบทิ้ง'}
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200"
                  onClick={() => handleAction('send')}
                  disabled={isSendDisabled}
                  title={isUploading ? 'รอให้การอัปโหลดเสร็จสิ้น' : undefined}
                >
                  {actionLoading === 'send' ? (
                    'กำลังส่ง...'
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      อนุมัติและส่งเมล
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t bg-gray-50 p-10 text-center mt-4">
              <div
                className={cn(
                  'inline-flex items-center px-4 py-2 rounded-full text-sm font-bold mb-2',
                  draft.status === 'APPROVED'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                )}
              >
                {draft.status === 'APPROVED' ? '✓ SENT' : '✕ REJECTED'}
              </div>
              <p className="text-muted-foreground text-sm">
                {draft.status === 'APPROVED'
                  ? 'อีเมลฉบับนี้ถูกส่งไปยังผู้รับเรียบร้อยแล้ว'
                  : 'คุณได้ทำการยกเลิกดราฟฉบับนี้แล้ว'}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}