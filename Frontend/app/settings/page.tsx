"use client";

import { SideNavbar } from "@/components/SideNavbar";
import SettingsPanel from "@/components/Settings";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/provider/AuthProvider";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <p className="text-sm font-semibold text-slate-500 animate-pulse">กำลังโหลดการตั้งค่า...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/60 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <div className="md:flex md:gap-6 items-start">
          <SideNavbar />

          <main className="flex-1 min-w-0">
            <section className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-7 min-h-[75vh]">
              <div className="flex items-center justify-between pb-5 mb-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold shadow-2xs border border-slate-200">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Settings</h1>
                    <p className="text-xs text-slate-500">ตั้งค่าข้อมูลส่วนตัว เวลาทำงาน และ Local AI Engine</p>
                  </div>
                </div>
              </div>

              <SettingsPanel />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

