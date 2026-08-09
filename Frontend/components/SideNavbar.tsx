'use client';
import Link from 'next/link';
import React from 'react';
import { usePathname } from 'next/navigation';
import { Inbox, FileText, Calendar, Sparkles, Settings, User, Bot } from 'lucide-react';

const items = [
  { label: 'Inbox', path: '/inbox', icon: Inbox },
  { label: 'Drafts', path: '/draft', icon: FileText },
  { label: 'Calendar', path: '/calendar', icon: Calendar },
  { label: 'Summary', path: '/summary', icon: Sparkles },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export function SideNavbar() {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile topbar navigation pill bar */}
      <div className="md:hidden sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs mb-4">
        <div className="mx-auto max-w-7xl px-2 py-2 flex items-center justify-between overflow-x-auto no-scrollbar">
          <div className="flex gap-1 min-w-full">
            {items.map((it) => {
              const Icon = it.icon;
              const isActive = pathname === it.path;
              return (
                <Link
                  key={it.label}
                  href={it.path}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{it.label}</span>
                </Link>
              );
            })}
            <Link
              href="/profile"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                pathname === '/profile'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Profile</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop left sidebar */}
      <aside className="hidden md:block w-64 shrink-0">
        <div className="sticky top-20">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-sm p-3.5">
            <div className="px-3 py-2 mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
              <span>MailMind Workspace</span>
            </div>

            <nav className="space-y-1.5">
              {items.map((it) => {
                const Icon = it.icon;
                const isActive = pathname === it.path;
                return (
                  <Link
                    key={it.label}
                    href={it.path}
                    className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all group ${
                      isActive
                        ? 'bg-blue-50/80 text-blue-600 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full shadow-xs" />
                    )}
                    <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                    }`} />
                    <span>{it.label}</span>
                  </Link>
                );
              })}

              <div className="pt-3 my-2 border-t border-slate-100" />

              <Link
                href="/profile"
                className={`relative w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all group ${
                  pathname === '/profile'
                    ? 'bg-blue-50/80 text-blue-600 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {pathname === '/profile' && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 bg-blue-600 rounded-r-full shadow-xs" />
                )}
                <User className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                  pathname === '/profile' ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                }`} />
                <span>Profile</span>
              </Link>
            </nav>

            {/* Quick AI Helper Card at Bottom of Sidebar */}
            <div className="mt-6 p-3.5 bg-linear-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
                <span className="text-xs font-bold text-slate-800">Local AI Core</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                ตอบกลับและบันทึกนัดหมายให้อัตโนมัติ ปลอดภัย 100%
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

