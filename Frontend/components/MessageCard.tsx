import DOMPurify from 'isomorphic-dompurify'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { ThreadMessage } from '@/lib/type'

export default function MessageCard({ message, isMain = false }: { message: ThreadMessage; isMain?: boolean }) {
  const fmtDate = (x: string | undefined) => {
    if (!x) return 'ไม่มีวันที่'
    const epoch = Number(x)
    const d = Number.isFinite(epoch) && epoch > 0 ? new Date(epoch) : new Date(x)
    try {
      return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    } catch {
      return x
    }
  }

  // ฟังก์ชันเช็คว่าเนื้อหาเป็น HTML หรือไม่
  const isHTML = (str: string) => /<[a-z][\s\S]*>/i.test(str);
  const content = message.body?.trim() || message.snippet || '';

  return (
    <div
      className={cn(
        "p-5 rounded-xl border transition-colors",
        isMain ? "bg-white shadow-sm" : "bg-muted/10 hover:bg-muted/20"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {!message.isRead && <Badge variant="secondary">New</Badge>}
            <h2 className={cn("font-semibold wrap-break-word", isMain ? "text-base text-gray-900" : "text-sm text-gray-700")}>
              {message.from}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">{fmtDate(message.internalDate || message.date)}</p>
        </div>
      </div>

      <Separator className="my-4" />

      {/* ✅ ส่วนแสดงผลอีเมล */}
      <div className="overflow-x-auto text-gray-800">
        {isHTML(content) ? (
          // ถ้าเป็น HTML ให้ Sanitize ก่อนเรนเดอร์แท็กรูปภาพและตารางออกมา
          <div 
            className="email-html-content text-[14px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} 
          />
        ) : (
          // ถ้าเป็นแค่ Text ธรรมดา ให้เว้นบรรทัดตามเดิม
          <div 
            className="text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word"
            style={{ overflowWrap: 'anywhere' }}
          >
            {content}
          </div>
        )}
      </div>
    </div>
  )
}