'use client';

import { useState, useEffect, useCallback } from 'react';
import DraftItem from './DraftItem';
import { useAuth } from '@/provider/AuthProvider';
import { Sparkles } from 'lucide-react';

export interface Draft {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  suggestedDate: string | null;
  location: string | null;
  draftReply: string;
  createdAt: string;
  status: string;
  priority?: string;
}

export default function DraftList() {
  const { logout } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      const appToken = localStorage.getItem('app_token');
      if (!appToken) return logout();

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/drafts`, {
        headers: { Authorization: `Bearer ${appToken}` },
      });

      if (response.status === 401) return logout();
      if (!response.ok) throw new Error('ไม่สามารถเชื่อมต่อข้อมูล Draft ได้');

      const data: Draft[] = await response.json();
      setDrafts(data);
    } catch (err: Error | unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleUpdateDraftStatus = (id: string, newStatus: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d)));
  };

  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 animate-pulse flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-4 bg-slate-200 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center text-rose-700 text-xs font-semibold">
        {error}
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto text-xl font-bold">
          📝
        </div>
        <p className="text-sm font-bold text-slate-700">ไม่มีฉบับร่างที่รอการอนุมัติ</p>
        <p className="text-xs text-slate-400">เมื่อ AI ตรวจพบอีเมลสำคัญ ระบบจะสร้างร่างคำตอบให้ปรากฏที่นี่</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {drafts.map((draft) => (
        <DraftItem key={draft.id} draft={draft} onUpdateDraft={handleUpdateDraftStatus} />
      ))}
    </div>
  );
}