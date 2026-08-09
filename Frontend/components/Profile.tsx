"use client";

import * as React from "react";
import Image from "next/image";
import { CheckCircle2, ShieldCheck, Mail, Calendar, LogOut } from "lucide-react";
import { useAuth } from "@/provider/AuthProvider";

export interface UserProfileProps {
  user: {
    name: string;
    email: string;
    picture?: string;
  } | null;
}

export default function GmailProfileCard({ user }: UserProfileProps) {
  const { logout } = useAuth();

  if (!user) return null; 

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Profile Header Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6 shadow-2xs">
        
        {/* Avatar */}
        {user.picture ? (
          <Image
            src={user.picture}
            alt={user.name || "User"}
            width={96}
            height={96}
            className="rounded-full ring-4 ring-blue-500/20 object-cover shadow-sm shrink-0"
          />
        ) : (
          <div className="h-24 w-24 rounded-full gradient-bg text-white flex items-center justify-center text-3xl font-black shrink-0 shadow-md shadow-blue-500/20">
            {(user.name || user.email || "U").charAt(0).toUpperCase()}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60 mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Google OAuth Verified
          </div>

          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {user.name || "Unnamed User"}
          </h2>

          <p className="text-sm font-medium text-slate-500">
            {user.email || "No email connected"}
          </p>

          <div className="pt-3">
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/80 hover:bg-rose-100 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              ออกจากระบบ (Sign Out)
            </button>
          </div>
        </div>
      </div>

      {/* Connected Services Status Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-2xs">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Connected Google Services</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Gmail API</p>
                <p className="text-[11px] text-slate-400">Read & Reply Access</p>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>

          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Google Calendar</p>
                <p className="text-[11px] text-slate-400">Event Sync Access</p>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
        </div>
      </div>
    </div>
  );
}