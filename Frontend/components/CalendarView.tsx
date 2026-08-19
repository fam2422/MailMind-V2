'use client'

import * as React from 'react'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
  format,
} from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAuth } from '@/provider/AuthProvider'
import type { CalendarEvent } from '@/lib/type'
import type { Draft } from './DraftList'
import DraftDialog from './DraftDialog'
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  ExternalLink,
  Clock,
  Sparkles,
  ArrowRight,
} from 'lucide-react'

export default function CalendarView() {
  const { logout } = useAuth()
  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

  const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date())
  const [events, setEvents] = React.useState<CalendarEvent[]>([])
  const [drafts, setDrafts] = React.useState<Draft[]>([])
  const [loading, setLoading] = React.useState(false)

  // Draft Dialog State
  const [selectedDraft, setSelectedDraft] = React.useState<Draft | null>(null)
  const [isDraftDialogOpen, setIsDraftDialogOpen] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('app_token')
      if (!token) return

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }

      // ดึงทั้ง Google Calendar Events และ Pending Drafts พร้อมกัน
      const [calRes, draftRes] = await Promise.all([
        fetch(`${API_BASE}/api/calendar`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/api/drafts`, { headers, cache: 'no-store' }),
      ])

      if (calRes.status === 401 || draftRes.status === 401) {
        logout()
        return
      }

      if (calRes.ok) {
        const calData = await calRes.json()
        setEvents(calData.items || [])
      }

      if (draftRes.ok) {
        const draftData: Draft[] = await draftRes.json()
        setDrafts(draftData || [])
      }
    } catch (err) {
      console.error('Error fetching calendar and drafts:', err)
    } finally {
      setLoading(false)
    }
  }, [API_BASE, logout])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleUpdateDraft = (draftId: string, newStatus: string) => {
    setDrafts((prev) =>
      newStatus === 'APPROVED' || newStatus === 'REJECTED'
        ? prev.filter((d) => d.id !== draftId)
        : prev.map((d) => (d.id === draftId ? { ...d, status: newStatus } : d))
    )
    fetchData() // Refresh calendar if approved
  }

  const today = new Date()

  const nextMonth = () => setCurrentMonth((m) => addMonths(m, 1))
  const prevMonth = () => setCurrentMonth((m) => subMonths(m, 1))
  const goToday = () => {
    const now = new Date()
    setCurrentMonth(now)
    setSelectedDate(now)
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const rows: React.JSX.Element[] = []
  let days: React.JSX.Element[] = []
  let day = weekStart
  let formattedDate = ''

  while (day <= weekEnd) {
    for (let i = 0; i < 7; i++) {
      formattedDate = format(day, 'd', { locale: th })
      const cloneDay = day

      // ค้นหา Event ใน Google Calendar
      const dayEvents = events.filter((ev) => {
        const d = ev.start ? new Date(ev.start) : ev.end ? new Date(ev.end) : null
        return d ? isSameDay(d, cloneDay) : false
      })

      // ค้นหา Pending Drafts ที่มี suggestedDate ตรงกับวันนี้
      const dayDrafts = drafts.filter((dr) => {
        if (!dr.suggestedDate) return false
        const d = new Date(dr.suggestedDate)
        return isSameDay(d, cloneDay)
      })

      const hasEvent = dayEvents.length > 0
      const hasDraft = dayDrafts.length > 0

      days.push(
        <div
          key={day.toISOString()}
          onClick={() => setSelectedDate(cloneDay)}
          className={cn(
            'min-h-[92px] border border-slate-100 p-2 cursor-pointer transition-all flex flex-col justify-between rounded-xl hover:bg-blue-50/50 hover:border-blue-200 group',
            !isSameMonth(day, monthStart) && 'bg-slate-50/50 text-slate-300',
            isSameDay(day, selectedDate) &&
              'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center',
                isSameDay(day, today)
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : isSameMonth(day, monthStart)
                    ? 'text-slate-700'
                    : 'text-slate-400'
              )}
            >
              {formattedDate}
            </span>

            <div className="flex items-center gap-1">
              {hasDraft && (
                <span
                  title="มีคำขอนัดหมาย AI รอการยืนยัน"
                  className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-200 animate-pulse"
                />
              )}
              {hasEvent && (
                <span
                  title="มีนัดหมายใน Google Calendar"
                  className="h-2 w-2 rounded-full bg-emerald-500"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-1">
            {/* แสดง Draft Preview ก่อน */}
            {dayDrafts.slice(0, 1).map((dr) => (
              <div
                key={dr.id}
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedDate(cloneDay)
                  setSelectedDraft(dr)
                  setIsDraftDialogOpen(true)
                }}
                className="truncate rounded-lg bg-amber-50 border border-dashed border-amber-300 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-100 transition-colors"
                title={`[รออนุมัติ] ${dr.subject}`}
              >
                <Sparkles className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                <span className="truncate">{dr.subject || 'นัดหมายใหม่'}</span>
              </div>
            ))}

            {/* แสดง Google Calendar Events */}
            {dayEvents.slice(0, dayDrafts.length > 0 ? 1 : 2).map((ev) => (
              <div
                key={ev.id}
                className="truncate rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-bold"
                title={ev.summary}
              >
                {ev.summary}
              </div>
            ))}

            {dayEvents.length + dayDrafts.length > 2 && (
              <span className="text-[9px] font-bold text-slate-400 pl-1">
                +{dayEvents.length + dayDrafts.length - 2} รายการ
              </span>
            )}
          </div>
        </div>
      )
      day = addDays(day, 1)
    }
    rows.push(
      <div className="grid grid-cols-7 gap-1" key={day.toISOString()}>
        {days}
      </div>
    )
    days = []
  }

  // คัดกรอง Event และ Draft สำหรับวันที่เลือก
  const selectedEvents = events.filter((ev) => {
    const d = ev.start ? new Date(ev.start) : ev.end ? new Date(ev.end) : null
    return d ? isSameDay(d, selectedDate) : false
  })

  const selectedDrafts = drafts.filter((dr) => {
    if (!dr.suggestedDate) return false
    const d = new Date(dr.suggestedDate)
    return isSameDay(d, selectedDate)
  })

  const fmtDateTime = (x: string | null) => {
    if (!x) return ''
    const d = new Date(x)
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  }

  const fmtTimeOnly = (x: string | null) => {
    if (!x) return ''
    const d = new Date(x)
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* Draft Review Dialog (Triggerable directly from Calendar) */}
      {selectedDraft && (
        <DraftDialog
          open={isDraftDialogOpen}
          onOpenChange={(open) => {
            setIsDraftDialogOpen(open)
            if (!open) setSelectedDraft(null)
          }}
          draft={selectedDraft}
          onUpdateDraft={handleUpdateDraft}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr,0.65fr]">
        {/* Left: Calendar Grid Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 lg:p-6 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black tracking-tight text-slate-900 capitalize">
                  {format(currentMonth, 'MMMM yyyy', { locale: th })}
                </h2>

                {drafts.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    มี {drafts.length} นัดหมายรอการอนุมัติ
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevMonth}
                  className="rounded-xl p-2 h-9 w-9"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={nextMonth}
                  className="rounded-xl p-2 h-9 w-9"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  onClick={goToday}
                  size="sm"
                  className="gradient-bg text-white font-bold rounded-xl text-xs shadow-2xs"
                >
                  วันนี้ (Today)
                </Button>
              </div>
            </div>

            {/* Legend indicators */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  นัดหมายที่ยืนยันแล้ว
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  คำขอนัดหมาย AI รออนุมัติ (Draft Preview)
                </span>
              </div>
            </div>

            <div className="grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wider text-slate-400 py-1">
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div className="text-blue-600">Sat</div>
              <div className="text-rose-500">Sun</div>
            </div>

            <div className="grid gap-1">{rows}</div>

            {loading && (
              <p className="text-xs text-slate-400 animate-pulse pt-2 text-center">
                กำลังซิงค์นัดหมายและฉบับร่างล่าสุดจาก Google Calendar & AI…
              </p>
            )}
          </div>
        </div>

        {/* Right: Selected Day Events & Drafts Card */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 lg:p-6 flex flex-col gap-4 shadow-2xs max-h-[85vh] overflow-y-auto">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Schedule Overview
            </span>
            <h3 className="text-lg font-black text-slate-900 mt-0.5">
              {format(selectedDate, 'd MMMM yyyy', { locale: th })}
            </h3>
          </div>
          <Separator className="bg-slate-100" />

          {/* 🌟 Section 1: AI Drafts Pending on this Day */}
          {selectedDrafts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  คำขอนัดหมายรอการยืนยัน ({selectedDrafts.length})
                </span>
              </div>

              <div className="space-y-2.5">
                {selectedDrafts.map((dr) => {
                  const hasConflictWithEvents =
                    dr.suggestedDate &&
                    selectedEvents.some((ev) => {
                      const evStart = new Date(ev.start || '')
                      const evEnd = new Date(ev.end || '')
                      const slotStart = new Date(dr.suggestedDate!)
                      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000)
                      return slotStart < evEnd && slotEnd > evStart
                    })

                  return (
                    <div
                      key={dr.id}
                      className={cn(
                        'rounded-2xl border p-4 space-y-3 transition-all',
                        hasConflictWithEvents
                          ? 'border-rose-200 bg-rose-50/50'
                          : 'border-amber-200 bg-amber-50/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider inline-block mb-1',
                              hasConflictWithEvents
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            )}
                          >
                            {hasConflictWithEvents ? '⚠️ มีนัดซ้อนทับ' : '✨ AI Proposed Slot'}
                          </span>
                          <p className="font-bold text-sm text-slate-900 line-clamp-1">
                            {dr.subject || 'นัดหมาย'}
                          </p>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold">
                            {fmtTimeOnly(dr.suggestedDate)} -{' '}
                            {fmtTimeOnly(
                              new Date(
                                new Date(dr.suggestedDate!).getTime() + 60 * 60 * 1000
                              ).toISOString()
                            )}{' '}
                            น.
                          </span>
                        </div>

                        {dr.location && (
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{dr.location}</span>
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={() => {
                          setSelectedDraft(dr)
                          setIsDraftDialogOpen(true)
                        }}
                        size="sm"
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <span>เปิดดูและอนุมัติ (Review & Send)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 📅 Section 2: Confirmed Google Calendar Events */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
              นัดหมายที่ยืนยันแล้วใน Google Calendar ({selectedEvents.length})
            </span>

            {selectedEvents.length === 0 && selectedDrafts.length === 0 ? (
              <div className="py-10 text-center space-y-2 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-lg">
                  📅
                </div>
                <p className="text-xs font-semibold text-slate-500">ไม่มีนัดหมายในวันนี้</p>
                <p className="text-[11px] text-slate-400">ตารางเวลาเปิดว่างตลอดทั้งวัน</p>
              </div>
            ) : selectedEvents.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">ไม่มีนัดหมายอื่นที่ยืนยันแล้วในวันนี้</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2 card-hover"
                  >
                    <p className="font-bold text-sm text-slate-900">{ev.summary}</p>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {fmtDateTime(ev.start)} – {fmtDateTime(ev.end)}
                      </span>
                    </div>

                    {ev.location && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{ev.location}</span>
                      </div>
                    )}

                    {ev.htmlLink && (
                      <a
                        href={ev.htmlLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline pt-1"
                      >
                        เปิดใน Google Calendar <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}