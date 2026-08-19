"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/provider/AuthProvider";
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
import { ArrowRight, Loader2, Cpu, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

  const [checkingSetup, setCheckingSetup] = React.useState(true);
  const [localModel, setLocalModel] = React.useState<string>("llama3.1:8b");
  const [availableModels, setAvailableModels] = React.useState<{ id: string; name: string }[]>([]);
  const [loadingModels, setLoadingModels] = React.useState(false);

  const [testingKey, setTestingKey] = React.useState(false);
  const [testResult, setTestResult] = React.useState({ text: "", type: "" });
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState({ text: "", type: "" });

  const fetchAvailableModels = React.useCallback(async () => {
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
          if (!data.models.some((m: { id: string }) => m.id === localModel)) {
            setLocalModel(data.models[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching available models:", err);
    } finally {
      setLoadingModels(false);
    }
  }, [API_BASE, localModel]);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }

    const checkExistingSetup = async () => {
      if (!user) return;
      try {
        const token = localStorage.getItem("app_token");
        const res = await fetch(`${API_BASE}/api/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.setting?.defaultModel) {
            setLocalModel(data.setting.defaultModel);
          }
        }
      } catch (error) {
        console.error("Error checking setup:", error);
      } finally {
        setCheckingSetup(false);
      }
    };

    if (user) {
      checkExistingSetup();
      fetchAvailableModels();
    }
  }, [user, authLoading, router, API_BASE, fetchAvailableModels]);

  const handleTestConnection = async () => {
    setTestingKey(true);
    setTestResult({ text: "", type: "" });

    try {
      const token = localStorage.getItem("app_token");
      const res = await fetch(`${API_BASE}/api/settings/test-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: "local", apiKey: "ollama", modelName: localModel }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "ไม่สามารถเชื่อมต่อ Local AI Server (Ollama) ได้");
      }

      const data = await res.json();
      setTestResult({ text: data.message || "✅ เชื่อมต่อ Local AI สำเร็จ!", type: "success" });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ";
      setTestResult({ text: `❌ ${errorMessage}`, type: "error" });
    } finally {
      setTestingKey(false);
    }
  };

  const handleCompleteSetup = async () => {
    setSaving(true);
    setMessage({ text: "", type: "" });

    try {
      const token = localStorage.getItem("app_token");
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          defaultProvider: "local",
          defaultModel: localModel,
        }),
      });

      if (!res.ok) throw new Error("ไม่สามารถบันทึกการตั้งค่าได้");

      setMessage({ text: "✅ ตั้งค่าเรียบร้อยแล้ว! กำลังเข้าสู่กล่องข้อความ...", type: "success" });
      setTimeout(() => {
        window.location.href = "/inbox";
      }, 1000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึก";
      setMessage({ text: `❌ ${errorMessage}`, type: "error" });
      setSaving(false);
    }
  };

  if (authLoading || checkingSetup || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-slate-500 font-medium animate-pulse">กำลังเตรียมความพร้อมของระบบ...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 space-y-8 relative overflow-hidden">
        
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none" />

        <div className="text-center space-y-3 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
            <Cpu className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">ตั้งค่า Local AI Assistant</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            MailMind ประมวลผลผ่าน Local Generative AI (Ollama) 100% <br/>
            ข้อมูลอีเมลของคุณจะคงอยู่บนเครื่องของคุณอย่างปลอดภัย
          </p>
        </div>

        <div className="space-y-6 relative z-10">
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/60 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>100% Privacy-Preserved</span>
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">
              ไม่ต้องกรอก API Key ภายนอก ระบบเชื่อมต่อไปยัง Ollama Server ที่รันบนเครื่องของคุณ (<code>http://localhost:11434/v1</code>)
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-700 font-semibold text-xs">Local AI Model</Label>
              <button
                type="button"
                onClick={fetchAvailableModels}
                disabled={loadingModels}
                className="text-[11px] text-slate-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RefreshCw className={cn("w-3 h-3", loadingModels && "animate-spin")} />
                <span>รีเฟรชโมเดล</span>
              </button>
            </div>

            {availableModels.length > 0 ? (
              <Select value={localModel} onValueChange={setLocalModel}>
                <SelectTrigger className="h-12 bg-slate-50 border-slate-200 font-mono text-sm">
                  <SelectValue placeholder="เลือกโมเดล" />
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
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                placeholder="เช่น llama3.1:8b"
                className="font-mono text-sm h-12 bg-slate-50 border-slate-200 focus:ring-blue-500"
              />
            )}
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleTestConnection}
              disabled={testingKey}
              className="w-full h-11 text-xs font-semibold cursor-pointer"
            >
              {testingKey ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังทดสอบการเชื่อมต่อกับ Ollama...
                </span>
              ) : (
                "ทดสอบการเชื่อมต่อ Local AI"
              )}
            </Button>

            {testResult.text && (
              <p className={cn("text-xs font-medium text-center", testResult.type === "success" ? "text-emerald-600" : "text-rose-600")}>
                {testResult.text}
              </p>
            )}
          </div>

          {message.text && (
            <div className={`text-sm p-3 rounded-lg text-center font-medium transition-all ${
              message.type === "error" ? "bg-rose-50 text-rose-600 border border-rose-100" :
              "bg-emerald-50 text-emerald-600 border border-emerald-100"
            }`}>
              {message.text}
            </div>
          )}

          <Button 
            className="w-full h-12 text-base font-semibold shadow-md shadow-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all mt-4 gradient-bg text-white cursor-pointer" 
            onClick={handleCompleteSetup}
            disabled={saving}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังบันทึก...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                เริ่มใช้งาน MailMind
                <ArrowRight className="w-5 h-5" />
              </span>
            )}
          </Button>

        </div>
      </div>
    </div>
  );
}