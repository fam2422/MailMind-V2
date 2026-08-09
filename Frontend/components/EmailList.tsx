'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import EmailItem from './EmailItem';
import { useAuth } from '@/provider/AuthProvider'; // ✅ ใช้ Hook เพื่อเช็คการล็อกเอาต์เมื่อ Token พัง

// ✅ กำหนด Type ให้ตรงกับ Backend
export interface Email {
  id: string;
  threadId: string;
  snippet: string;
  isRead: boolean;
  from: string;
  subject: string;
  date: string;
  status: string;
}

interface EmailsResponse {
  items: Email[];
  nextPageToken?: string;
  hasMore: boolean;
}

export default function EmailList() {
  const { logout } = useAuth(); // ดึงฟังก์ชัน logout มาเตรียมไว้
  
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // ✅ ระบบจัดการหน้า (Pagination) แบบเก็บประวัติ เพื่อให้กด Previous ได้ถูกต้อง
  const [pageHistory, setPageHistory] = useState<(string | undefined)[]>([undefined]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);

  // ฟังก์ชันดึงข้อมูล (ใช้ useCallback ป้องกันการ re-render ซ้ำซ้อน)
  const fetchEmails = useCallback(async (token?: string) => {
    try {
      setLoading(true);
      setError(null);

      const appToken = localStorage.getItem('app_token');
      if (!appToken) {
        logout(); // ถ้าหา Token ไม่เจอ ให้เตะออก
        return;
      }

      const url = new URL(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/emails`);
      if (token) url.searchParams.set('pageToken', token);
      url.searchParams.set('pageSize', '10');

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${appToken}` },
      });

      // ✅ ดักจับกรณี Token หมดอายุหรือไม่ถูกต้องจาก Backend
      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'ไม่สามารถเชื่อมต่อข้อมูลอีเมลได้');
      }

      const data: EmailsResponse = await response.json();
      setEmails(data.items);
      setNextPageToken(data.nextPageToken);
      setHasMore(data.hasMore);

    } catch (err: Error | unknown) {
      const message = err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อข้อมูลอีเมลได้';
      setError(message);
      console.error('Error fetching emails:', err);
    } finally {
      setLoading(false);
    }
  }, [logout]);

  // ฟังก์ชันซิงค์อีเมลใหม่ด้วย Backend + AI
  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setSyncMessage(null);

      const appToken = localStorage.getItem('app_token');
      if (!appToken) {
        logout();
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/emails/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${appToken}` },
      });

      if (response.status === 401) {
        logout();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการซิงค์อีเมล');
      }

      setLastSyncedAt(new Date());
      setSyncMessage('ซิงค์อีเมลสำเร็จ!');

      // โหลดรายการอีเมลใหม่
      await fetchEmails(pageHistory[currentIndex]);

      setTimeout(() => {
        setSyncMessage(null);
      }, 4000);

    } catch (err: Error | unknown) {
      const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการซิงค์อีเมล';
      setSyncMessage(`เกิดข้อผิดพลาด: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // โหลดหน้าแรกสุดเมื่อเข้าเว็บ
  useEffect(() => {
    fetchEmails(pageHistory[currentIndex]);
  }, [currentIndex, fetchEmails, pageHistory]);

  const handleEmailUpdate = (id: string, patch: Partial<Email>) => {
    setEmails((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const handleNext = () => {
    if (nextPageToken) {
      // เก็บ token หน้าถัดไปเข้าประวัติ แล้วขยับ index
      setPageHistory((prev) => {
        const newHistory = [...prev];
        newHistory[currentIndex + 1] = nextPageToken;
        return newHistory;
      });
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  if (loading && emails.length === 0) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 animate-pulse flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/4" />
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && emails.length === 0) {
    return (
      <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-6 text-center space-y-3">
        <h3 className="text-base font-bold text-rose-900">เกิดข้อผิดพลาดในการโหลดอีเมล</h3>
        <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => fetchEmails(pageHistory[currentIndex])}
          className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header Bar สำหรับซิงค์อีเมล */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={isSyncing || loading}
            className="flex items-center gap-2 px-4 py-2 gradient-bg hover:opacity-95 text-white font-semibold rounded-xl text-xs transition-all shadow-md shadow-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="กดเพื่อซิงค์อีเมลใหม่จาก Gmail"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'กำลังซิงค์ข้อมูล...' : 'ซิงค์อีเมลใหม่'}
          </button>

          {lastSyncedAt && (
            <span className="text-xs text-slate-400 bg-slate-100/70 px-3 py-1 rounded-full border border-slate-200/60">
              ซิงค์ล่าสุด: {lastSyncedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
            </span>
          )}
        </div>

        {syncMessage && (
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
            syncMessage.startsWith('เกิดข้อผิดพลาด') 
              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {!syncMessage.startsWith('เกิดข้อผิดพลาด') && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {syncMessage}
          </div>
        )}
      </div>

      {emails.length === 0 ? (
        <div className="bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mx-auto text-xl font-bold">
            📬
          </div>
          <p className="text-sm font-semibold text-slate-600">ไม่มีอีเมลในกล่องข้อความของคุณ</p>
          <p className="text-xs text-slate-400">กดปุ่ม &quot;ซิงค์อีเมลใหม่&quot; ด้านบนเพื่อเริ่มดึงข้อมูลจาก Gmail</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {emails.map((email) => (
              <EmailItem key={email.id} email={email} onEmailUpdate={handleEmailUpdate} />
            ))}
          </div>

          {/* Pagination Bar */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0 || isSyncing}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            >
              ← หน้าก่อนหน้า
            </button>

            <span className="text-xs font-bold text-slate-500 bg-slate-100/80 px-3 py-1.5 rounded-full">
              หน้า {currentIndex + 1}
            </span>

            <button
              onClick={handleNext}
              disabled={!hasMore || isSyncing}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            >
              หน้าถัดไป →
            </button>
          </div>
        </>
      )}
    </div>
  );
}