"use client";

import * as React from "react";


import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { User, Clock, Cpu, MessageSquare, Sparkles, CheckCircle2, RefreshCw } from "lucide-react";

const weekDays = [
  { key: "mon", label: "จันทร์" },
  { key: "tue", label: "อังคาร" },
  { key: "wed", label: "พุธ" },
  { key: "thu", label: "พฤหัสบดี" },
  { key: "fri", label: "ศุกร์" },
  { key: "sat", label: "เสาร์" },
  { key: "sun", label: "อาทิตย์" },
];


export default function SettingsPanel() {
  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState({ text: "", type: "" });

  // State API Key และปุ่ม Test / Delete
  const [configuredKeys, setConfiguredKeys] = React.useState<Record<string, boolean>>({});
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [testingKey, setTestingKey] = React.useState(false);
  const [deletingKey, setDeletingKey] = React.useState(false);
  const [testResult, setTestResult] = React.useState({ text: "", type: "" });

  // State การตั้งค่าทั่วไป
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("17:00");
  const [workDays, setWorkDays] = React.useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [timezone, setTimezone] = React.useState("asia-bangkok");
  const [title, setTitle] = React.useState("mr");
  const [tone, setTone] = React.useState("formal");

  // State ข้อมูลส่วนตัว (Personal Profile)
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [gender, setGender] = React.useState("MALE");
  const [position, setPosition] = React.useState("");
  const [signature, setSignature] = React.useState("ขอแสดงความนับถือ");

  // 🌟 State AI Provider & Model (Local AI)
  const [aiProvider, setAiProvider] = React.useState("local");
  const [localModel, setLocalModel] = React.useState<string>("");
  const [availableModels, setAvailableModels] = React.useState<{ id: string; name: string }[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);

  // Helper ฟังก์ชันดึงชื่อ Model
  const getCurrentModelName = () => {
    return localModel || "llama3.1:latest";
  };

  // ฟังก์ชันดึงรายชื่อโมเดลจาก Ollama Server
  const fetchAvailableModels = async () => {
    setLoadingModels(true);
    try {
      const token = localStorage.getItem("app_token");
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/settings/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models) && data.models.length > 0) {
          setAvailableModels(data.models);
        }
      }
    } catch (err) {
      console.error("Error fetching available models:", err);
    } finally {
      setLoadingModels(false);
    }
  };

  // โหลดข้อมูลครั้งแรก
  React.useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem("app_token");
        if (!token) return;

        const res = await fetch(`${API_BASE}/api/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();

          if (data.setting?.defaultModel) {
            setLocalModel(data.setting.defaultModel);
          } else if (data.activeModel) {
            setLocalModel(data.activeModel);
          }
          const s = data.setting;

          if (s) {
            // โหลดตั้งค่าเดิม
            if (s.startTime) setStartTime(s.startTime);
            if (s.endTime) setEndTime(s.endTime);
            if (s.workDays) setWorkDays(s.workDays);
            if (s.timezone) setTimezone(s.timezone);
            if (s.title) setTitle(s.title);
            if (s.tone) setTone(s.tone);

            // โหลดข้อมูลส่วนตัว
            if (s.firstName) setFirstName(s.firstName);
            if (s.lastName) setLastName(s.lastName);
            if (s.gender) setGender(s.gender);
            if (s.position) setPosition(s.position);
            if (s.signature) setSignature(s.signature);

            if (s.defaultModel) setLocalModel(s.defaultModel);
          }
          if (data.configuredKeys) {
            setConfiguredKeys(data.configuredKeys);
          }
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
    fetchAvailableModels();
  }, [API_BASE]);

  // ฟังก์ชันทดสอบ Local AI
  const handleTestKey = async () => {
    setTestingKey(true);
    setTestResult({ text: "", type: "" });

    try {
      const token = localStorage.getItem("app_token");
      const modelName = getCurrentModelName();

      const res = await fetch(`${API_BASE}/api/settings/test-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ provider: "local", apiKey: "ollama", modelName }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `ไม่สามารถเชื่อมต่อ Local AI Server (Ollama) ได้`);
      }

      const data = await res.json();
      setTestResult({ text: data.message || "✅ เชื่อมต่อ Local AI สำเร็จ!", type: "success" });
    } catch (error: Error | unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setTestResult({ text: `❌ ${errorMessage}`, type: "error" });
    } finally {
      setTestingKey(false);
    }
  };

  // ฟังก์ชันบันทึก
  const handleSave = async () => {
    setSaving(true);
    setMessage({ text: "", type: "" });
    try {
      const token = localStorage.getItem("app_token");
      const finalModelName = getCurrentModelName();

      const settingRes = await fetch(`${API_BASE}/api/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          defaultProvider: "local",
          defaultModel: finalModelName,
          startTime,
          endTime,
          workDays,
          timezone,
          title,
          tone,
          firstName,
          lastName,
          gender,
          position,
          signature
        }),
      });

      if (!settingRes.ok) throw new Error("เกิดข้อผิดพลาดในการบันทึกการตั้งค่าทั่วไป");

      setMessage({ text: "บันทึกการตั้งค่าเรียบร้อยแล้ว", type: "success" });
      setTimeout(() => setMessage({ text: "", type: "" }), 3000);
    } catch (error: Error | unknown) {
      console.error("Error saving:", error);
      const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก";
      setMessage({ text: errorMessage, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">กำลังโหลดการตั้งค่า...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6 relative pb-10">
      {message.text && (
        <div className={cn("p-3 rounded-md text-sm font-medium mb-4 text-center sticky top-0 z-10 shadow-sm transition-all",
          message.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        )}>
          {message.text}
        </div>
      )}

      {/* =========================================
          ข้อมูลส่วนตัว (Personal Profile) 
      ========================================= */}
      {/* =========================================
          ข้อมูลส่วนตัว (Personal Profile) 
      ========================================= */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 shadow-2xs">

        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Personal Profile</h3>
            <p className="text-xs text-slate-500">ข้อมูลส่วนตัวเพื่อให้ AI ใช้ร่างอีเมล (สรรพนามและลายเซ็น)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName" className="text-xs font-bold text-slate-700">ชื่อจริง (First Name)</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="เช่น สมชาย" className="rounded-xl border-slate-200 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName" className="text-xs font-bold text-slate-700">นามสกุล (Last Name)</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="เช่น ใจดี" className="rounded-xl border-slate-200 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="genderSelect" className="text-xs font-bold text-slate-700">เพศ (ใช้กำหนด ครับ/ค่ะ)</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="genderSelect" className="rounded-xl border-slate-200 text-sm">
                <SelectValue placeholder="เลือกเพศ" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="MALE">ชาย (Male) - ใช้ &quot;ผม/ครับ&quot;</SelectItem>
                <SelectItem value="FEMALE">หญิง (Female) - ใช้ &quot;ดิฉัน/ค่ะ&quot;</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="titleSelect" className="text-xs font-bold text-slate-700">คำนำหน้าชื่อ (Title)</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger id="titleSelect" className="rounded-xl border-slate-200 text-sm">
                <SelectValue placeholder="เลือกคำนำหน้า" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="mr">นาย (Mr.)</SelectItem>
                <SelectItem value="mrs">นาง (Mrs.)</SelectItem>
                <SelectItem value="ms">นางสาว (Ms.)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="position" className="text-xs font-bold text-slate-700">ตำแหน่งงาน (Position)</Label>
            <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="เช่น ผู้จัดการฝ่ายขาย" className="rounded-xl border-slate-200 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="signature" className="text-xs font-bold text-slate-700">คำลงท้าย (Sign-off)</Label>
            <Input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="เช่น ขอแสดงความนับถือ" className="rounded-xl border-slate-200 text-sm" />
          </div>
        </div>
      </section>

      {/* =========================================
          Working hours 
      ========================================= */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-2xs">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Working hours</h3>
            <p className="text-xs text-slate-500">กำหนดช่วงเวลาทำงานเพื่ออนุมัติกิจกรรมลง Google Calendar</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="startTime" className="text-xs font-bold text-slate-700">Start time</Label>
            <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-xl border-slate-200 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endTime" className="text-xs font-bold text-slate-700">End time</Label>
            <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-xl border-slate-200 text-sm" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold text-slate-700">Work days</Label>
          <div className="flex flex-wrap gap-2">
            {weekDays.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleWorkDay(d.key)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                  workDays.includes(d.key)
                    ? "bg-blue-600 text-white shadow-xs shadow-blue-500/20"
                    : "bg-slate-100 text-slate-600 border border-slate-200/80 hover:bg-slate-200"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timezone" className="text-xs font-bold text-slate-700">Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" className="w-full sm:max-w-xs rounded-xl border-slate-200 text-sm">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="asia-bangkok">Asia/Bangkok (GMT+7)</SelectItem>
              <SelectItem value="asia-tokyo">Asia/Tokyo (GMT+9)</SelectItem>
              <SelectItem value="europe-london">Europe/London (GMT+0)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* =========================================
          Generative AI Engine (Local AI)
      ========================================= */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shadow-2xs">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Local Generative AI Engine (Ollama)</h3>
              <p className="text-xs text-slate-500">ประมวลผลผ่าน Local AI Model 100% ปลอดภัย ไม่ส่งข้อมูลออกภายนอก</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Local AI Active
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="aiProvider" className="text-xs font-bold text-slate-700">AI Engine</Label>
            <Input id="aiProvider" value="Local AI (Ollama Server)" disabled className="bg-slate-50 font-medium rounded-xl text-sm" />

            <div className="mt-4 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">Active Model (Ollama)</Label>
                <button
                  type="button"
                  onClick={fetchAvailableModels}
                  disabled={loadingModels}
                  title="รีเฟรชรายชื่อโมเดลจาก Ollama"
                  className="text-[11px] text-slate-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw className={cn("w-3 h-3", loadingModels && "animate-spin")} />
                  <span>รีเฟรชโมเดล</span>
                </button>
              </div>

              {availableModels.length > 0 ? (
                <Select value={getCurrentModelName()} onValueChange={(val) => setLocalModel(val)}>
                  <SelectTrigger className="bg-white font-mono text-xs font-bold text-blue-600 rounded-xl h-10 w-full">
                    <SelectValue placeholder="เลือกโมเดลที่ต้องการ..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={getCurrentModelName()}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="เช่น llama3.1:latest"
                  className="bg-white font-mono text-xs font-bold text-blue-600 rounded-xl"
                />
              )}

              <p className="text-[11px] text-slate-500">
                ประมวลผลผ่าน Ollama Server บนเครื่อง (<code>http://localhost:11434/v1</code>)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-700">Local AI Server Status</Label>
            <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-700">
                  Ollama API (<code className="text-blue-600">{getCurrentModelName()}</code>)
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleTestKey}
                disabled={testingKey}
                className="w-full text-xs font-bold rounded-xl cursor-pointer"
              >
                {testingKey ? "กำลังทดสอบการเชื่อมต่อ..." : "ทดสอบการเชื่อมต่อ Local AI"}
              </Button>
              {testResult.text && (
                <p className={cn("text-xs font-semibold pt-1", testResult.type === "success" ? "text-emerald-600" : "text-rose-600")}>
                  {testResult.text}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================
          Reply Tone 
      ========================================= */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 shadow-2xs">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Reply tone</h3>
            <p className="text-xs text-slate-500">
              เลือกโทนภาษาที่ใช้ในการตอบกลับอีเมล เช่น ทางการ (Formal) หรือไม่ทางการ (Casual)
            </p>
          </div>
        </div>

        <div className="w-full sm:max-w-xs space-y-1.5">
          <Label htmlFor="toneSelect" className="text-xs font-bold text-slate-700">Tone Preference</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="toneSelect" className="rounded-xl border-slate-200 text-sm">
              <SelectValue placeholder="เลือกโทนภาษา" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="formal">Formal (ทางการ / สุภาพสุจริต)</SelectItem>
              <SelectItem value="informal">Informal (เป็นกันเอง / กระชับ)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* =========================================
          Action Buttons 
      ========================================= */}
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" type="button" onClick={() => window.location.reload()} className="rounded-xl text-xs font-semibold">
          ยกเลิก
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gradient-bg hover:opacity-95 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 cursor-pointer">
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </Button>
      </div>
    </div>
  );
}
