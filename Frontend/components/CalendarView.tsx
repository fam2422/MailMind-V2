'use client'

import * as React from 'react'
import { addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAuth } from '@/provider/AuthProvider'
import type { CalendarEvent } from '@/lib/type'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, ExternalLink, Clock } from 'lucide-react'

export default function CalendarView() {
  const { logout } = useAuth()
  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

  const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date())
  const [events, setEvents] = React.useState<CalendarEvent[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    let isMounted = true

    ;(async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('app_token')
        
        const res = await fetch(`${API_BASE}/api/calendar`, { 
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          cache: 'no-store' 
        })

        if (res.status === 401) {
          logout()
          return
        }

        const data = await res.json()
        if (res.ok && isMounted) {
          setEvents(data.items || [])
        } else if (isMounted) {
          console.warn('calendar error', data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        if (isMounted) setLoading(false)
      }
    })()

    return () => { isMounted = false }
  }, [API_BASE, logout])

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
      const dayEvents = events.filter((ev) => {
        const d = ev.start ? new Date(ev.start) : ev.end ? new Date(ev.end) : null
        return d ? isSameDay(d, cloneDay) : false
      })
      const hasEvent = dayEvents.length > 0

      days.push(
        <div
          key={day.toISOString()}
          onClick={() => setSelectedDate(cloneDay)}
          className={cn(
            'min-h-[85px] border border-slate-100 p-2 cursor-pointer transition-all flex flex-col justify-between rounded-xl hover:bg-blue-50/50 hover:border-blue-200',
            !isSameMonth(day, monthStart) && 'bg-slate-50/50 text-slate-300',
            isSameDay(day, selectedDate) && 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs',
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn('text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center', 
              isSameDay(day, today) 
                ? 'bg-blue-600 text-white shadow-2xs' 
                : isSameMonth(day, monthStart) ? 'text-slate-700' : 'text-slate-400'
            )}>
              {formattedDate}
            </span>
            {hasEvent && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />}
          </div>

          <div className="flex flex-col gap-1 mt-1">
            {dayEvents.slice(0, 2).map((ev) => (
              <div key={ev.id} className="truncate rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-bold">
                {ev.summary}
              </div>
            ))}
            {dayEvents.length > 2 && (
              <span className="text-[9px] font-bold text-slate-400 pl-1">
                +{dayEvents.length - 2} นัดหมาย
              </span>
            )}
          </div>
        </div>
      )
      day = addDays(day, 1)
    }
    rows.push(<div className="grid grid-cols-7 gap-1" key={day.toISOString()}>{days}</div>)
    days = []
  }

  const selectedEvents = events.filter((ev) => {
    const d = ev.start ? new Date(ev.start) : ev.end ? new Date(ev.end) : null
    return d ? isSameDay(d, selectedDate) : false
  })

  const fmtDateTime = (x: string | null) => {
    if (!x) return ''
    const d = new Date(x)
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr,0.6fr]">
      {/* Left: Calendar Grid Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 lg:p-6 shadow-2xs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-900 capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: th })}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevMonth} className="rounded-xl p-2 h-9 w-9">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth} className="rounded-xl p-2 h-9 w-9">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button onClick={goToday} size="sm" className="gradient-bg text-white font-bold rounded-xl text-xs shadow-2xs">
                วันนี้ (Today)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wider text-slate-400 py-1">
            <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div>
            <div className="text-blue-600">Sat</div><div className="text-rose-500">Sun</div>
          </div>

          <div className="grid gap-1">{rows}</div>

          {loading && <p className="text-xs text-slate-400 animate-pulse pt-2">กำลังซิงค์นัดหมายล่าสุดจาก Google Calendar…</p>}
        </div>
      </div>

      {/* Right: Selected Day Events Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 lg:p-6 flex flex-col gap-4 shadow-2xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Events Details</span>
          <h3 className="text-lg font-black text-slate-900 mt-0.5">
            {format(selectedDate, 'd MMMM yyyy', { locale: th })}
          </h3>
        </div>
        <Separator className="bg-slate-100" />

        {selectedEvents.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-lg">
              📅
            </div>
            <p className="text-xs font-semibold text-slate-500">ไม่มีนัดหมายในวันนี้</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-2 card-hover">
                <p className="font-bold text-sm text-slate-900">{ev.summary}</p>
                
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{fmtDateTime(ev.start)} – {fmtDateTime(ev.end)}</span>
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
  )
}