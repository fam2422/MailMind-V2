'use client';

import * as React from 'react';
import DraftDialog from './DraftDialog';
import { Badge } from '@/components/ui/badge';
import type { Draft } from './DraftList';
import { Sparkles, CheckCircle2, XCircle, Clock } from 'lucide-react';

type DraftItemProps = {
  draft: Draft;
  onUpdateDraft: (id: string, newStatus: string) => void;
};

export default function DraftItem({ draft, onUpdateDraft }: DraftItemProps) {
  const [open, setOpen] = React.useState(false);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderStatus = () => {
    if (draft.status === 'APPROVED') {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-50 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sent
        </Badge>
      );
    }
    if (draft.status === 'REJECTED') {
      return (
        <Badge className="bg-rose-50 text-rose-700 border border-rose-200/80 hover:bg-rose-50 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <XCircle className="w-3 h-3 text-rose-600" /> Rejected
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-50 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3 text-amber-600" /> Pending Approval
      </Badge>
    );
  };

  const renderPriority = () => {
    if (!draft.priority) return null;

    switch (draft.priority) {
      case 'HIGH':
        return <Badge className="bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-100 text-[10px] font-bold">🔥 ด่วนมาก</Badge>;
      case 'NORMAL':
        return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50 text-[10px] font-bold">ปกติ</Badge>;
      case 'LOW':
        return <Badge className="bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-100 text-[10px] font-bold">ทั่วไป</Badge>;
      default:
        return null;
    }
  };

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
        className={`group p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer ${
          draft.status !== 'PENDING'
            ? 'bg-slate-50/70 border-slate-200/60 opacity-80 hover:opacity-100 hover:bg-white hover:border-slate-300'
            : 'bg-white border-indigo-100/90 shadow-2xs hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          
          {/* Left Icon */}
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center text-sm shrink-0 border border-indigo-100 group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>

          {/* Middle Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-sm truncate ${draft.status === 'PENDING' ? 'font-bold text-slate-900 group-hover:text-indigo-600 transition-colors' : 'font-medium text-slate-600'}`}>
                Re: {draft.subject || 'ไม่มีหัวข้อ'}
              </span>
              {renderPriority()}
            </div>

            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
              {draft.draftReply || 'ไม่มีข้อความตัวอย่าง'}
            </p>
          </div>

          {/* Right Status */}
          <div className="shrink-0 flex flex-col items-end gap-2 text-xs text-slate-400 font-medium">
            <span>{formatDate(draft.createdAt)}</span>
            {renderStatus()}
          </div>

        </div>
      </div>

      <DraftDialog
        open={open}
        onOpenChange={setOpen}
        draft={draft}
        onUpdateDraft={onUpdateDraft}
      />
    </>
  );
}