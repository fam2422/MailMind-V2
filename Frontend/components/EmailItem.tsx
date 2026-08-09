'use client';

import * as React from 'react';
import ThreadDialog from './ThreadDialog';
import type { Email } from './EmailList';

type EmailItemWithCbProps = {
  email: Email;
  onEmailUpdate?: (id: string, patch: Partial<Email>) => void;
};

// Helper สุ่มสี Background Avatar ตามชื่อผู้ส่ง
const getAvatarGradient = (name: string) => {
  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-purple-500 to-pink-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',
  ];
  let charCodeSum = 0;
  for (let i = 0; i < name.length; i++) {
    charCodeSum += name.charCodeAt(i);
  }
  return gradients[charCodeSum % gradients.length];
};

export default function EmailItem({ email, onEmailUpdate }: EmailItemWithCbProps) {
  const [open, setOpen] = React.useState(false);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const epoch = Number(dateString);
    const d = Number.isFinite(epoch) && epoch > 0 ? new Date(epoch) : new Date(dateString);
    try {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const extractEmail = (from: string) => {
    if (!from) return 'Unknown';
    const match = from.match(/<(.+?)>/);
    return match ? match[1] : from;
  };

  const extractName = (from: string) => {
    if (!from) return 'Unknown Sender';
    const match = from.match(/^(.+?)\s*</);
    if (match) return match[1].replace(/["']/g, '').trim();
    return from.split('@')[0];
  };

  const name = extractName(email.from);
  const initial = name.charAt(0).toUpperCase();
  const avatarGradient = getAvatarGradient(name);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
        className={`group p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer ${
          email.isRead 
            ? 'bg-slate-50/70 border-slate-200/60 opacity-80 hover:opacity-100 hover:bg-white hover:border-slate-300 hover:shadow-sm' 
            : 'bg-white border-blue-100/90 shadow-2xs hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          
          {/* Left Avatar */}
          <div className={`w-10 h-10 rounded-full bg-linear-to-br ${avatarGradient} text-white font-bold flex items-center justify-center text-sm shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
            {initial}
          </div>

          {/* Middle Body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {!email.isRead && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                  NEW
                </span>
              )}

              <span className={`text-sm truncate ${email.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>
                {name}
              </span>

              <span className="text-xs text-slate-400 truncate hidden sm:inline-block">
                &lt;{extractEmail(email.from)}&gt;
              </span>
            </div>

            <h3
              className={`text-sm sm:text-base mb-1.5 truncate ${
                email.isRead ? 'font-medium text-slate-600' : 'font-bold text-slate-900 group-hover:text-blue-600 transition-colors'
              }`}
            >
              {email.subject || '(ไม่มีหัวข้อเรื่อง)'}
            </h3>

            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
              {email.snippet?.replace(/&#39;/g, "'").replace(/&quot;/g, '"') || 'ไม่มีเนื้อหาข้อความตัวอย่าง'}
            </p>
          </div>

          {/* Right Date */}
          <div className="shrink-0 flex flex-col items-end text-xs text-slate-400 font-medium">
            <span>{formatDate(email.date)}</span>
          </div>

        </div>
      </div>

      <ThreadDialog
        open={open}
        onOpenChange={setOpen}
        threadId={email.threadId}
        mainId={email.id}
        onEmailUpdate={onEmailUpdate}
      />
    </>
  );
}