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
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="text-gray-500 text-sm">กำลังซิงค์อีเมลจาก Gmail...</p>
      </div>
    );
  }

  if (error && emails.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-2">เกิดข้อผิดพลาด</h3>
        <p className="text-red-700">{error}</p>
        <button
          onClick={() => fetchEmails(pageHistory[currentIndex])}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header Bar สำหรับซิงค์อีเมล */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={isSyncing || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="กดเพื่อซิงค์อีเมลใหม่จาก Gmail"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'กำลังซิงค์...' : 'ซิงค์อีเมล'}
          </button>

          {lastSyncedAt && (
            <span className="text-xs text-gray-500">
              ซิงค์ล่าสุด: {lastSyncedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
            </span>
          )}
        </div>

        {syncMessage && (
          <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
            syncMessage.startsWith('เกิดข้อผิดพลาด') 
              ? 'bg-red-50 text-red-700 border border-red-200' 
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {!syncMessage.startsWith('เกิดข้อผิดพลาด') && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
            {syncMessage}
          </div>
        )}
      </div>

      {emails.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center text-gray-500">
          ไม่มีอีเมลในกล่องข้อความของคุณ
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {emails.map((email) => (
              <EmailItem key={email.id} email={email} onEmailUpdate={handleEmailUpdate} />
            ))}
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0 || isSyncing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <span className="text-sm text-gray-600">
              หน้า {currentIndex + 1}
            </span>

            <button
              onClick={handleNext}
              disabled={!hasMore || isSyncing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}