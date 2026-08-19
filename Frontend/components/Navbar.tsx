"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/provider/AuthProvider';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, LogOut, Bot } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isAiActive, setIsAiActive] = useState<boolean | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem("app_token");
        if (!token) return;

        const res = await fetch(`${API_BASE}/api/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data && data.setting && typeof data.setting.isAutoReplyActive !== 'undefined') {
            setIsAiActive(data.setting.isAutoReplyActive);
          }
        } else {
          console.error("Failed to fetch settings, Status:", res.status);
        }
      } catch (error) {
        console.error('Failed to fetch AI status:', error);
      }
    };

    if (user) fetchStatus();
  }, [user, API_BASE]);

  if (pathname === '/login' || pathname === '/privacy' || pathname === '/terms') {
    return null;
  }

  const handleToggleCron = async () => {
    if (isToggling || isAiActive === null) return;
    setIsToggling(true);
    
    const oldValue = isAiActive;
    const newValue = !isAiActive;
    setIsAiActive(newValue); 

    try {
      const token = localStorage.getItem('app_token');
      const response = await fetch(`${API_BASE}/api/settings/toggle-cron`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isAutoReplyActive: newValue })
      });

      if (!response.ok) throw new Error('Update failed in Database');
      
    } catch (error) {
      console.error(error);
      setIsAiActive(oldValue); 
      alert('ไม่สามารถเปลี่ยนสถานะผู้ช่วย AI ได้');
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 glass-nav shadow-xs transition-all">
      <div className="container mx-auto px-4 sm:px-6 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                Mail<span className="gradient-text">Mind</span>
              </span>
            </Link>
          </div>

          {/* User Controls / Auth Buttons */}
          <div className="flex items-center gap-3 sm:gap-5">
            
            {user ? (
              <>
                {/* AI Status Pill Button */}
                <div className="flex items-center gap-2.5 bg-slate-100/80 px-3 py-1.5 rounded-full border border-slate-200/80 shadow-2xs">
                  <div className="relative flex items-center justify-center">
                    {isAiActive && (
                      <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    )}
                    <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${
                      isAiActive === null ? 'bg-slate-300' : isAiActive ? 'bg-emerald-500' : 'bg-amber-400'
                    }`} />
                  </div>

                  <span className={`text-xs font-semibold tracking-wide ${
                    isAiActive === null ? 'text-slate-400' : isAiActive ? 'text-emerald-700' : 'text-slate-500'
                  }`}>
                    {isAiActive === null ? 'Checking...' : isAiActive ? 'AI Auto-Reply On' : 'AI Paused'}
                  </span>

                  <button
                    onClick={handleToggleCron}
                    disabled={isToggling || isAiActive === null}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                      isAiActive ? 'bg-emerald-500' : 'bg-slate-300'
                    } ${(isToggling || isAiActive === null) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    title={isAiActive ? "ปิดระบบตอบรับอัตโนมัติ" : "เปิดระบบตอบรับอัตโนมัติ"}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        isAiActive ? 'translate-x-4.5' : 'translate-x-1'
                      } shadow-xs`}
                    />
                  </button>
                </div>

                {/* Profile Widget */}
                <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                  {user.picture ? (
                    <Image
                      src={user.picture}
                      alt={user.name || 'User'}
                      width={36}
                      height={36}
                      className="rounded-full object-cover ring-2 ring-blue-500/20 shadow-xs"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm ring-2 ring-blue-500/20">
                      {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="text-left hidden md:block leading-tight">
                    <p className="text-xs font-bold text-slate-800 truncate max-w-[130px]">{user.name}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-[130px]">{user.email}</p>
                  </div>

                  {/* Sign Out Button */}
                  <button
                    onClick={logout}
                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    title="ออกจากระบบ"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <Link 
                href="/login" 
                className="px-5 py-2 text-sm font-semibold text-white gradient-bg hover:opacity-95 rounded-xl transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
              >
                <Bot className="w-4 h-4" />
                เข้าสู่ระบบ (Login)
              </Link>
            )}
            
          </div>
        </div>
      </div>
    </header>
  );
}