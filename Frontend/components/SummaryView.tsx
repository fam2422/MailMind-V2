"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar, CalendarDays, CalendarRange, Sparkles, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export default function SummaryView() {
  const [activeTab, setActiveTab] = React.useState<TabType>('DAILY');
  const [loading, setLoading] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const fetchSummary = async (type: TabType, forceNew: boolean = false) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('app_token');
      const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      
      const res = await fetch(`${API_BASE}/api/summary?type=${type}&force=${forceNew}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) throw new Error('Failed to fetch summary');
      
      const data = await res.json();
      setSummary(data.content);
    } catch (error) {
      console.error(error);
      setSummary("เกิดข้อผิดพลาดในการดึงข้อมูลสรุป โปรดลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchSummary(activeTab, false);
  }, [activeTab]);

  const handleRegenerate = () => {
    fetchSummary(activeTab, true);
  };

  const handleCopy = () => {
    if (summary) {
      navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        
        {/* iOS-Style Pill Segmented Control */}
        <div className="flex p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/60 shadow-2xs">
          <button
            onClick={() => setActiveTab('DAILY')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer",
              activeTab === 'DAILY' 
                ? "bg-white text-blue-600 shadow-sm shadow-slate-200" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Calendar className="w-3.5 h-3.5" /> รายวัน
          </button>
          <button
            onClick={() => setActiveTab('WEEKLY')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer",
              activeTab === 'WEEKLY' 
                ? "bg-white text-blue-600 shadow-sm shadow-slate-200" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" /> รายสัปดาห์
          </button>
          <button
            onClick={() => setActiveTab('MONTHLY')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer",
              activeTab === 'MONTHLY' 
                ? "bg-white text-blue-600 shadow-sm shadow-slate-200" 
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            <CalendarRange className="w-3.5 h-3.5" /> รายเดือน
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {summary && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="rounded-xl border-slate-200 text-xs font-semibold hover:bg-slate-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 mr-1.5" /> : <Copy className="w-3.5 h-3.5 text-slate-500 mr-1.5" />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกสรุป'}
            </Button>
          )}

          <Button 
            onClick={handleRegenerate} 
            disabled={loading}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-sm shadow-blue-500/20"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            )}
            วิเคราะห์สรุปใหม่
          </Button>
        </div>
      </div>

      {/* Summary View Content Box */}
      <div className="flex-1 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-6 sm:p-8 relative overflow-hidden min-h-[350px]">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xs z-10 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-md shadow-blue-500/10">
              <Sparkles className="w-6 h-6 animate-spin" />
            </div>
            <p className="text-sm font-bold text-slate-700 animate-pulse">✨ AI กำลังวิเคราะห์ตารางงานของคุณ...</p>
            <p className="text-xs text-slate-400">ระบบกำลังสกัดนัดหมายและจัดหมวดหมู่อัตโนมัติ</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/60">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-100/80 px-2.5 py-1 rounded-full border border-purple-200/60">
                AI Generated Summary ({activeTab})
              </span>
            </div>

            <div className="prose prose-slate max-w-none">
              <div className="whitespace-pre-wrap text-slate-700 text-sm leading-relaxed font-normal">
                {summary || "ไม่พบข้อมูลตารางงานในช่วงเวลานี้"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}