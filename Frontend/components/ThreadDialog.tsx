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
import { Label } from '@/components/ui/label'
import { Send, Sparkles } from 'lucide-react'
import MessageCard from './MessageCard'
import type { ThreadMessage } from '@/lib/type'

export default function ThreadDialog({
  open,
  onOpenChange,
  threadId,
  mainId,
  onEmailUpdate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  threadId: string
  mainId?: string
  onEmailUpdate?: (id: string, patch: Record<string, unknown>) => void
}) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ThreadMessage[]>([])

  const [draftLoading, setDraftLoading] = React.useState(false)
  const [sendLoading, setSendLoading] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const [isAppointment, setIsAppointment] = React.useState<boolean | null>(null)
  const [reply, setReply] = React.useState('')

  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

  const onEmailUpdateRef = React.useRef(onEmailUpdate)
  React.useEffect(() => {
    onEmailUpdateRef.current = onEmailUpdate
  }, [onEmailUpdate])

  // 🌟 1. โหลดข้อมูล + ทำให้เมลอ่านแล้ว (Mark as Read)
  React.useEffect(() => {
    if (!open || !threadId) return
    const controller = new AbortController()

    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        setReply('')
        setIsAppointment(null)
        setActionError(null)

        const token = localStorage.getItem('app_token')
        const reqHeaders = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }

        const res = await fetch(`${API_BASE}/api/threads/${threadId}`, {
          signal: controller.signal,
          headers: reqHeaders,
          cache: 'no-store',
        })

        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Failed to load thread')
        }
        
        const data = await res.json()
        setMessages(data.items ?? [])

        // ✅ เรียก API mark-read เฉพาะครั้งแรก
        if (mainId && onEmailUpdateRef.current) {
          onEmailUpdateRef.current(mainId, { isRead: true })
          fetch(`${API_BASE}/api/emails/mark-read`, {
            method: 'POST',
            headers: reqHeaders,
            body: JSON.stringify({ messageId: mainId })
          }).catch(() => {})
        }

      } catch (e: unknown) {
        const msg =
          typeof e === 'object' && e !== null && 'message' in e
            ? (e as { message: string }).message
            : String(e)
        if ((e as { name?: string })?.name !== 'AbortError') setError(msg)
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [open, threadId, mainId, API_BASE])

  const main = messages.find((m) => m.id === mainId) ?? (messages.length ? messages[messages.length - 1] : undefined)
  const rest = messages.filter((m) => m.id !== main?.id)

  // 🌟 2. สั่ง AI สร้างข้อความร่าง
  async function handleGenerateDraft() {
    if (!main) return
    try {
      setDraftLoading(true)
      setActionError(null)

      const token = localStorage.getItem('app_token')
      
      // ✅ เรียก API generate ให้ตรงกับ Route ของ Draft (ปกติมักจะเป็น /api/drafts/generate)
      const res = await fetch(`${API_BASE}/api/drafts/generate`, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          messageId: main.id,
          threadId: main.threadId,
        }),
      })

      if (!res.ok) throw new Error('ไม่สามารถสร้างข้อความร่างได้')
      
      const data = await res.json()
      setReply(data.draftReply || data.replyText || '')
      setIsAppointment(data.isAppointment ?? false)
      
      // อัปเดต UI ข้างนอกให้โชว์ Badge ว่า Draft แล้ว
      onEmailUpdate?.(main.id, { status: 'DRAFT' })

      } catch (e: unknown) {
        const msg =
          typeof e === 'object' && e !== null && 'message' in e
            ? (e as { message: string }).message
            : String(e)
        console.error(msg)
        setActionError(msg || 'Draft error')
      } finally {
      setDraftLoading(false)
    }
  }

// 🌟 3. ส่งอีเมลตอบกลับ
async function handleSend() {
  if (!main || !reply.trim()) return;
  
  try {
    setSendLoading(true);
    setActionError(null);

    const token = localStorage.getItem('app_token');
    
    // ✅ เรียก API สำหรับส่งอีเมลแบบ Direct
    const res = await fetch(`${API_BASE}/api/emails/threads/${threadId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  },
  body: JSON.stringify({ 
    messageId: main.id, 
    threadId: main.threadId,
    replyText: reply 
  }),
});

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ไม่สามารถส่งอีเมลได้');
    }

    onEmailUpdate?.(main.id, { status: 'SENT' });
    onOpenChange(false);
    
  } catch (e: unknown) {
    const msg =
      typeof e === 'object' && e !== null && 'message' in e
        ? (e as { message: string }).message
        : String(e);
        
    // 🌟 ปิด console.error ไว้เพื่อไม่ให้ ESLint แจ้งเตือน (หรือลบบรรทัดนี้ทิ้งได้เลย)
    // console.error(msg);
    
    setActionError(msg || 'Send error');
  } finally {
    setSendLoading(false);
  }
}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-4xl p-0 overflow-hidden rounded-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        
        <DialogHeader className="shrink-0 px-6 pt-5 pb-3 border-b bg-muted/30">
          <DialogTitle className="text-lg font-semibold line-clamp-2">
            {main?.subject || 'Conversation'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-4 mt-1">
            {messages.length > 0 ? `${messages.length} ข้อความในการสนทนานี้` : ''}
            {isAppointment === true && ' • ✨ AI Detected Appointment'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground bg-gray-50/50">
            Loading conversation...
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-600 bg-gray-50/50">
            {error}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 bg-gray-50/50 relative">
            
            <div className="p-6 space-y-6">
              {main && <MessageCard message={main} isMain={true} />}
              {rest.length > 0 && (
                <div className="pt-2 space-y-4">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-2">
                    Conversation Thread
                  </div>
                  {rest.map(m => <MessageCard key={m.id} message={m} />)}
                </div>
              )}
            </div>

            {main && (
              <div className="sticky bottom-0 border-t bg-white p-6 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                <div className="space-y-4">
                  <Label htmlFor="reply" className="text-sm font-bold text-blue-700">
                    {isAppointment === true ? '✨ AI Suggested Reply' : 'Reply'}
                  </Label>
                  
                  <Textarea
                    id="reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="min-h-35 font-sans text-base leading-relaxed bg-slate-50 p-4 border-slate-200 focus:bg-white transition-colors"
                    placeholder={
                      isAppointment === true
                        ? 'แก้ไขข้อความที่ AI ร่างให้ที่นี่...'
                        : 'พิมพ์ข้อความที่คุณต้องการตอบกลับ หรือคลิกปุ่มด้านขวาล่างให้ AI ช่วยร่างข้อความ...'
                    }
                  />
                  
                  <div className="flex justify-between items-center pt-1">
                    <div className="text-sm font-medium text-red-600">
                      {actionError}
                    </div>
                    <div className="flex gap-3">
                      {/* ✅ ปุ่มสร้างร่างคำตอบ เรียก handleGenerateDraft */}
                      <Button 
                        onClick={handleGenerateDraft} 
                        variant="outline"
                        disabled={draftLoading || sendLoading}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        {draftLoading ? 'กำลังคิด...' : 'สร้างร่างคำตอบ'}
                      </Button>

                      {/* ✅ ปุ่มส่งอีเมล เรียก handleSend */}
                      <Button 
                        onClick={handleSend} 
                        disabled={sendLoading || draftLoading || !reply.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200"
                      >
                        {sendLoading ? (
                          'กำลังส่ง...'
                        ) : (
                          <><Send className="w-4 h-4 mr-2" />ส่งอีเมล</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}