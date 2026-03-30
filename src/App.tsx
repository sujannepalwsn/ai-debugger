import React, { useState, useEffect } from 'react';
import { 
  Bug, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Code, 
  Shield, 
  Database, 
  Layout, 
  Send,
  Loader2,
  ChevronRight,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ErrorPayload {
  errorType: string;
  message: string;
  stack?: string;
  endpoint?: string;
  module?: string;
  component?: string;
  action?: string;
  user?: { role: string; id: string; centerId: string };
  schemaContext?: string[];
  statusCode?: string;
  severity?: string;
}

interface DebugResult {
  rootCause: string;
  fixType: 'query' | 'schema' | 'rls' | 'ui' | 'logic';
  fix: string;
  filesToUpdate: string[];
  codeChanges: string;
  why: string;
  prevention: string;
  confidence: number;
}

interface ChecklistItem {
  name: string;
  status: string;
  coverage: string;
}

interface FixHistoryEntry {
  errorType: string;
  message: string;
  rootCause: string;
  fixType: string;
  fix: string;
  codeChanges: string;
  timestamp: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'debug' | 'history'>('dashboard');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [history, setHistory] = useState<FixHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [payload, setPayload] = useState<ErrorPayload>({
    errorType: 'Supabase 400',
    message: 'Could not find column "lesson_id" in table "activities"',
    module: 'Activities',
    action: 'Create Activity',
    user: { role: 'teacher', id: 'user_123', centerId: 'center_456' },
    severity: 'high'
  });

  useEffect(() => {
    fetchChecklist();
    fetchHistory();
  }, []);

  const fetchChecklist = async () => {
    try {
      const res = await fetch('/api/checklist');
      const data = await res.json();
      setChecklist(data.modules || []);
    } catch (e) {
      console.error('Failed to fetch checklist');
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data || []);
    } catch (e) {
      console.error('Failed to fetch history');
    }
  };

  const handleDebug = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setDebugResult(null);
    try {
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setDebugResult(data);
      fetchHistory();
    } catch (e) {
      console.error('Failed to debug');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white font-sans selection:bg-blue-500/30">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 border-r border-white/10 bg-[#0F0F11] p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-600/20">
            <Bug className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">AI Debugger</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              activeTab === 'dashboard' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
            )}
          >
            <Layout className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('debug')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              activeTab === 'debug' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
            )}
          >
            <Terminal className="w-5 h-5" />
            <span className="font-medium">Debug Tool</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
              activeTab === 'history' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
            )}
          >
            <History className="w-5 h-5" />
            <span className="font-medium">Fix History</span>
          </button>
        </nav>

        <div className="mt-auto p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">System Status</span>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Autonomous rule engine active. Memory sync complete.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="ml-64 p-10 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-3xl font-bold mb-2">ERP Module Coverage</h2>
                <p className="text-white/50">Tracking debugging readiness across school management modules.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {checklist.map((item, idx) => (
                  <div key={idx} className="p-6 bg-[#0F0F11] border border-white/5 rounded-2xl hover:border-blue-500/30 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold text-white/90 group-hover:text-white">{item.name}</h3>
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                        item.status === 'Ready' ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                      )}>
                        {item.status}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-white/40">
                        <span>Coverage</span>
                        <span>{item.coverage}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            item.coverage === 'High' ? "w-full bg-blue-500" : 
                            item.coverage === 'Medium' ? "w-2/3 bg-blue-500/60" : "w-1/3 bg-blue-500/30"
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'debug' && (
            <motion.div 
              key="debug"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-10"
            >
              <div className="space-y-8">
                <header>
                  <h2 className="text-3xl font-bold mb-2">Manual Debugger</h2>
                  <p className="text-white/50">Simulate ERP error payloads to test AI analysis.</p>
                </header>

                <form onSubmit={handleDebug} className="space-y-4 p-8 bg-[#0F0F11] border border-white/5 rounded-3xl">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Error Message</label>
                    <textarea 
                      value={payload.message}
                      onChange={(e) => setPayload({ ...payload, message: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:border-blue-500/50 outline-none transition-all h-32"
                      placeholder="Paste error message here..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Error Type</label>
                      <input 
                        value={payload.errorType}
                        onChange={(e) => setPayload({ ...payload, errorType: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Module</label>
                      <input 
                        value={payload.module}
                        onChange={(e) => setPayload({ ...payload, module: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <button 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Analyze Error
                  </button>
                </form>
              </div>

              <div className="space-y-6">
                {debugResult ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 bg-[#0F0F11] border border-blue-500/20 rounded-3xl space-y-6"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Analysis Complete</span>
                      </div>
                      <span className="text-xs text-white/40">Confidence: {(debugResult.confidence * 100).toFixed(0)}%</span>
                    </div>

                    <section className="space-y-2">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-blue-400" />
                        Root Cause
                      </h3>
                      <p className="text-white/60 text-sm leading-relaxed">{debugResult.rootCause}</p>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <Code className="w-5 h-5 text-blue-400" />
                        Recommended Fix
                      </h3>
                      <div className="bg-black/60 rounded-2xl p-4 border border-white/5">
                        <pre className="text-xs text-blue-300 font-mono overflow-x-auto">
                          {debugResult.codeChanges || debugResult.fix}
                        </pre>
                      </div>
                    </section>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Fix Type</h4>
                        <span className="text-sm font-semibold capitalize">{debugResult.fixType}</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Impact</h4>
                        <span className="text-sm font-semibold">Production Ready</span>
                      </div>
                    </div>

                    <section className="space-y-2">
                      <h3 className="text-sm font-bold flex items-center gap-2 text-white/80">
                        <Info className="w-4 h-4 text-blue-400" />
                        Prevention Strategy
                      </h3>
                      <p className="text-white/40 text-xs leading-relaxed">{debugResult.prevention}</p>
                    </section>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-white/5 rounded-3xl">
                    <div className="p-4 bg-white/5 rounded-full mb-4">
                      <Terminal className="w-8 h-8 text-white/20" />
                    </div>
                    <h3 className="text-white/40 font-medium">Ready for input</h3>
                    <p className="text-white/20 text-sm max-w-[200px]">Submit an error payload to begin autonomous analysis.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-3xl font-bold mb-2">Fix History</h2>
                  <p className="text-white/50">Memory of previous autonomous debugging sessions.</p>
                </div>
                <div className="text-right">
                  <span className="text-4xl font-bold text-blue-500">{history.length}</span>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Total Fixes</p>
                </div>
              </header>

              <div className="space-y-4">
                {history.map((item, idx) => (
                  <div key={idx} className="p-6 bg-[#0F0F11] border border-white/5 rounded-2xl flex items-center gap-6 group hover:border-blue-500/30 transition-all">
                    <div className="p-3 bg-white/5 rounded-xl text-blue-400 group-hover:bg-blue-500/10 transition-colors">
                      {item.fixType === 'rls' ? <Shield className="w-6 h-6" /> : 
                       item.fixType === 'query' ? <Database className="w-6 h-6" /> : <Code className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-white/90 truncate">{item.errorType}</h3>
                        <span className="text-[10px] text-white/30 font-mono">{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-white/40 truncate">{item.message}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white/60">
                        {item.fixType}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-white/10 group-hover:text-blue-500 transition-colors" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
