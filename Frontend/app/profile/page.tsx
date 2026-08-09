"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SideNavbar } from "@/components/SideNavbar";
import GmailProfileCard from "@/components/Profile";
import { User } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("app_token");

    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token หมดอายุหรือไม่ถูกต้อง");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        localStorage.removeItem("app_token");
        router.replace("/login");
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <p className="text-sm font-semibold text-slate-500 animate-pulse">กำลังโหลดโปรไฟล์...</p>
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
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-2xs border border-blue-100">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">User Profile</h1>
                    <p className="text-xs text-slate-500">ข้อมูลบัญชีและการเชื่อมต่อ Google Services</p>
                  </div>
                </div>
              </div>

              <GmailProfileCard user={user} />
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}