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
  const [localModel, setLocalModel] = React.useState("llama3.1:8b");

  // Helper ฟังก์ชันดึงชื่อ Model
  const getCurrentModelName = () => {
    return localModel || "llama3.1:8b";
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
      <section className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Personal Profile</h3>
            <p className="text-sm text-muted-foreground">ข้อมูลส่วนตัวเพื่อให้ AI ใช้ร่างอีเมล (สรรพนามและลายเซ็น)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="firstName">ชื่อจริง (First Name)</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="เช่น สมชาย" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lastName">นามสกุล (Last Name)</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="เช่น ใจดี" />
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="genderSelect">เพศ (ใช้กำหนด ครับ/ค่ะ)</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="genderSelect">
                <SelectValue placeholder="เลือกเพศ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">ชาย (Male) - ใช้ &quot;ผม/ครับ&quot;</SelectItem>
                <SelectItem value="FEMALE">หญิง (Female) - ใช้ &quot;ดิฉัน/ค่ะ&quot;</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="titleSelect">คำนำหน้าชื่อ (Title)</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger id="titleSelect">
                <SelectValue placeholder="เลือกคำนำหน้า" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mr">นาย (Mr.)</SelectItem>
                <SelectItem value="mrs">นาง (Mrs.)</SelectItem>
                <SelectItem value="ms">นางสาว (Ms.)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="position">ตำแหน่งงาน (Position)</Label>
            <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="เช่น ผู้จัดการฝ่ายขาย" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="signature">คำลงท้าย (Sign-off)</Label>
            <Input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="เช่น ขอแสดงความนับถือ" />
          </div>
        </div>
      </section>

      {/* =========================================
          Working hours 
      ========================================= */}
      <section className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Working hours</h3>
            <p className="text-sm text-muted-foreground">กำหนดช่วงเวลาทำงาน</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="startTime">Start time</Label>
            <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endTime">End time</Label>
            <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Work days</Label>
          <div className="flex flex-wrap gap-2">
            {weekDays.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleWorkDay(d.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-sm border transition",
                  workDays.includes(d.key)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-slate-50 text-slate-600 border-slate-200"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="timezone">Timezone</Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger id="timezone" className="w-full sm:max-w-xs">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
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
      <section className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Local Generative AI Engine (Ollama)</h3>
            <p className="text-sm text-muted-foreground">ระบบกำลังประมวลผลผ่าน Local AI Model แบบ 100% (ไม่ต้องใช้ External API Key)</p>
          </div>
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
            Local AI Connected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="aiProvider">AI Engine</Label>
            <Input id="aiProvider" value="Local AI (Ollama Server)" disabled className="bg-slate-100 font-medium" />

            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
              <Label className="text-xs">Active Model</Label>
              <Input value="llama3.1:8b" disabled className="bg-white font-mono text-sm font-semibold text-blue-600" />
              <p className="text-[11px] text-slate-500">
                ประมวลผลผ่าน Ollama Server บนเครื่อง (<code>http://localhost:11434/v1</code>)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Local AI Server Status</Label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-semibold text-slate-700">Ollama API (`llama3.1:8b`)</span>
              </div>
              <Button 
                type="button" 
                variant="secondary" 
                onClick={handleTestKey}
                disabled={testingKey} 
                className="w-full text-xs"
              >
                {testingKey ? "กำลังทดสอบการเชื่อมต่อ..." : "ทดสอบการเชื่อมต่อ Local AI"}
              </Button>
              {testResult.text && (
                <p className={cn("text-xs font-medium pt-1", testResult.type === "success" ? "text-green-600" : "text-red-600")}>
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
      <section className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Reply tone</h3>
            <p className="text-sm text-muted-foreground">
              เลือกโทนภาษาที่ใช้ในการตอบกลับอีเมล เช่น ทางการ (Formal) หรือไม่ทางการ (Casual)
            </p>
          </div>
        </div>

        <div className="w-full sm:max-w-xs space-y-1">
          <Label htmlFor="toneSelect">Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="toneSelect">
              <SelectValue placeholder="เลือกโทนภาษา" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="formal">Formal (ทางการ)</SelectItem>
              <SelectItem value="informal">Informal (ไม่ทางการ)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* =========================================
          Action Buttons 
      ========================================= */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" type="button" onClick={() => window.location.reload()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "กำลังบันทึก..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}