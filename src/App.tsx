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
  Info,
  Menu,
  GitPullRequest,
  Settings,
  X,
  Book
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ErrorPayload {
  id?: string;
  timestamp?: string;
  userId?: string;
  userRole?: string;
  centerId?: string;
  moduleName?: string;
  componentName?: string;
  action?: string;
  errorType: string;
  message: string;
  stack?: string;
  endpoint?: string;
  schemaContext?: string;
  statusCode?: number;
  severity: string;
  device_info?: any;
  created_at?: string;
  payload?: any;
}

interface DebugResult {
  rootCause: string;
  fixType: 'Database' | 'Code' | 'UI';
  fix?: string;
  filesToUpdate?: string[];
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
  error_type: string;
  message: string;
  rootCause: string;
  fixType: string;
  fix: string;
  codeChanges: string;
  timestamp: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'debug' | 'history' | 'setup' | 'settings' | 'rules'>('dashboard');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('github_token') || '');
  const [githubOwner, setGithubOwner] = useState(() => localStorage.getItem('github_owner') || '');
  const [githubRepo, setGithubRepo] = useState(() => localStorage.getItem('github_repo') || '');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [history, setHistory] = useState<FixHistoryEntry[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [payload, setPayload] = useState<ErrorPayload>({
    errorType: 'Supabase 400',
    message: 'Could not find column "lesson_id" in table "activities"',
    moduleName: 'Activities',
    action: 'Create Activity',
    userRole: 'teacher',
    userId: 'user_123',
    centerId: 'center_456',
    severity: 'high'
  });

  const webhookUrl = `${window.location.origin}/api/debug`;

  useEffect(() => {
    fetchChecklist();
    fetchHistory();
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      setRules(data || []);
    } catch (e) {
      console.error('Failed to fetch rules');
    }
  };

  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('github_token', githubToken);
  }, [githubToken]);

  useEffect(() => {
    localStorage.setItem('github_owner', githubOwner);
  }, [githubOwner]);

  useEffect(() => {
    localStorage.setItem('github_repo', githubRepo);
  }, [githubRepo]);

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
    setPrUrl(null);
    try {
      const res = await fetch('/api/debug', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-gemini-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.status === 'queued') {
        // Show a temporary message while processing
        setDebugResult({
          rootCause: "Autonomous analysis in progress...",
          fixType: "Code",
          fix: "The error has been queued for background analysis. Results will appear in history shortly.",
          codeChanges: "// Processing...",
          why: "Non-blocking batch processing is active.",
          prevention: "Check history tab in a few seconds.",
          confidence: 0.5
        });
        
        // Poll for history update
        setTimeout(() => {
          fetchHistory();
          setLoading(false);
        }, 3000);
      } else {
        setDebugResult(data);
        fetchHistory();
        setLoading(false);
      }
    } catch (e) {
      console.error('Failed to debug');
      setLoading(false);
    }
  };

  const [prLoading, setPrLoading] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const handleCreatePR = async () => {
    if (!debugResult || !debugResult.filePath || !debugResult.fullFileContent) return;
    
    setPrLoading(true);
    setPrUrl(null);
    try {
      const res = await fetch('/api/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubToken,
          owner: githubOwner,
          repo: githubRepo,
          filePath: debugResult.filePath,
          content: debugResult.fullFileContent,
          title: `Fix: ${payload.errorType}`,
          body: `### AI Debugger Fix\n\n**Root Cause:** ${debugResult.rootCause}\n\n**Fix:** ${debugResult.fix || debugResult.why}\n\n**Prevention:** ${debugResult.prevention}`,
        })
      });
      const data = await res.json();
      if (data.prUrl) {
        setPrUrl(data.prUrl);
      } else {
        throw new Error(data.error || 'Failed to create PR');
      }
    } catch (e: any) {
      console.error('PR Error:', e);
      alert(e.message || 'Failed to create Pull Request');
    } finally {
      setPrLoading(false);
    }
  };

  const [newRule, setNewRule] = useState({ pattern: '', fix: '', fixType: 'Code' });

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule)
      });
      if (res.ok) {
        fetchRules();
        setNewRule({ pattern: '', fix: '', fixType: 'Code' });
      }
    } catch (e) {
      console.error('Failed to add rule');
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all fix history?')) return;
    try {
      await fetch('/api/history', { method: 'DELETE' });
      fetchHistory();
    } catch (e) {
      console.error('Failed to clear history');
    }
  };

  const handleDeleteRule = async (index: number) => {
    try {
      await fetch(`/api/rules/${index}`, { method: 'DELETE' });
      fetchRules();
    } catch (e) {
      console.error('Failed to delete rule');
    }
  };

  const NavItems = () => (
    <nav className="flex flex-col gap-2">
      <button 
        onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
          activeTab === 'dashboard' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <Layout className="w-5 h-5" />
        <span className="font-medium">Dashboard</span>
      </button>
      <button 
        onClick={() => { setActiveTab('debug'); setIsMobileMenuOpen(false); }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
          activeTab === 'debug' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <Terminal className="w-5 h-5" />
        <span className="font-medium">Debug Tool</span>
      </button>
      <button 
        onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
          activeTab === 'history' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <History className="w-5 h-5" />
        <span className="font-medium">Fix History</span>
      </button>
      <button 
        onClick={() => { setActiveTab('rules'); setIsMobileMenuOpen(false); }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
          activeTab === 'rules' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <Book className="w-5 h-5" />
        <span className="font-medium">Rule Engine</span>
      </button>
      <button 
        onClick={() => { setActiveTab('setup'); setIsMobileMenuOpen(false); }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
          activeTab === 'setup' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <Info className="w-5 h-5" />
        <span className="font-medium">Setup Guide</span>
      </button>
      <button 
        onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
          activeTab === 'settings' ? "bg-white/5 text-blue-400" : "text-white/50 hover:bg-white/5 hover:text-white"
        )}
      >
        <Settings className="w-5 h-5" />
        <span className="font-medium">Settings</span>
      </button>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white font-sans selection:bg-blue-500/30">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-white/10 bg-[#0F0F11] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-600 rounded-lg">
            <Bug className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-base tracking-tight">AI Debugger</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-white/70 hover:text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 z-40 lg:hidden bg-[#0F0F11] p-6 pt-20 flex flex-col gap-8"
          >
            <NavItems />
            <div className="mt-auto p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Autonomous Engine Status</span>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-white/40 leading-relaxed">
                  {apiKey ? 'AI Mode Active (Gemini). Rule Engine synced.' : 'Local Mode Active. AI Fallback enabled.'}
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Non-blocking Queue: Ready</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full w-64 border-r border-white/10 bg-[#0F0F11] p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-600/20">
            <Bug className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">AI Debugger</h1>
        </div>

        <NavItems />

        <div className="mt-auto p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Autonomous Status</span>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-white/40 leading-relaxed">
              {apiKey ? 'AI Mode Active.' : 'Local Mode Active.'}
            </p>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Queue: Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className={cn(
        "p-6 lg:p-10 max-w-6xl mx-auto transition-all duration-300",
        "lg:ml-64"
      )}>
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
                <h2 className="text-2xl lg:text-3xl font-bold mb-2">ERP Module Coverage</h2>
                <p className="text-white/50 text-sm lg:text-base">Tracking debugging readiness across school management modules.</p>
              </header>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {checklist.map((item, idx) => (
                  <div key={idx} className="p-5 lg:p-6 bg-[#0F0F11] border border-white/5 rounded-2xl hover:border-blue-500/30 transition-colors group">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold text-white/90 group-hover:text-white text-sm lg:text-base">{item.name}</h3>
                      <span className={cn(
                        "px-2 py-1 rounded-md text-[9px] lg:text-[10px] font-bold uppercase tracking-wider",
                        item.status === 'Ready' ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                      )}>
                        {item.status}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] lg:text-xs text-white/40">
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
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10"
            >
              <div className="space-y-6 lg:space-y-8">
                <header>
                  <h2 className="text-2xl lg:text-3xl font-bold mb-2">Manual Debugger</h2>
                  <p className="text-white/50 text-sm lg:text-base">Simulate ERP error payloads to test AI analysis.</p>
                </header>

                <form onSubmit={handleDebug} className="space-y-4 p-6 lg:p-8 bg-[#0F0F11] border border-white/5 rounded-3xl">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Error Message</label>
                    <textarea 
                      value={payload.message}
                      onChange={(e) => setPayload({ ...payload, message: e.target.value })}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:border-blue-500/50 outline-none transition-all h-24 lg:h-32"
                      placeholder="Paste error message here..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Error Type</label>
                      <input 
                        value={payload.errorType}
                        onChange={(e) => setPayload({ ...payload, errorType: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Severity</label>
                      <select 
                        value={payload.severity}
                        onChange={(e) => setPayload({ ...payload, severity: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Module</label>
                      <input 
                        value={payload.moduleName}
                        onChange={(e) => setPayload({ ...payload, moduleName: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Action</label>
                      <input 
                        value={payload.action}
                        onChange={(e) => setPayload({ ...payload, action: e.target.value })}
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
                    className="p-6 lg:p-8 bg-[#0F0F11] border border-blue-500/20 rounded-3xl space-y-6"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Analysis Complete</span>
                      </div>
                      <span className="text-[10px] text-white/40">Confidence: {(debugResult.confidence * 100).toFixed(0)}%</span>
                    </div>

                    <section className="space-y-2">
                      <h3 className="text-base lg:text-lg font-bold flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-blue-400" />
                        Root Cause
                      </h3>
                      <p className="text-white/60 text-xs lg:text-sm leading-relaxed">{debugResult.rootCause}</p>
                    </section>

                    <section className="space-y-2">
                      <h3 className="text-base lg:text-lg font-bold flex items-center gap-2">
                        <Code className="w-5 h-5 text-blue-400" />
                        Ready-to-Use Fix
                      </h3>
                      <div className="bg-black/60 rounded-2xl p-4 border border-white/5">
                        <pre className="text-[10px] lg:text-xs text-blue-300 font-mono overflow-x-auto whitespace-pre-wrap">
                          {debugResult.codeChanges}
                        </pre>
                      </div>
                    </section>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[9px] lg:text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Fix Type</h4>
                        <span className="text-xs lg:text-sm font-semibold capitalize">{debugResult.fixType}</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[9px] lg:text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Impact</h4>
                        <span className="text-xs lg:text-sm font-semibold">Production Ready</span>
                      </div>
                    </div>

                    {debugResult.filePath && debugResult.fullFileContent && (
                      <div className="pt-4 border-t border-white/5">
                        <button 
                          onClick={handleCreatePR}
                          disabled={prLoading || !githubToken || !githubOwner || !githubRepo}
                          className="w-full bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-white/10"
                        >
                          {prLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitPullRequest className="w-4 h-4" />}
                          {prUrl ? 'PR Created!' : 'Create GitHub Pull Request'}
                        </button>
                        {prUrl && (
                          <a 
                            href={prUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="block text-center mt-2 text-[10px] text-blue-400 hover:underline"
                          >
                            View Pull Request on GitHub
                          </a>
                        )}
                        {(!githubToken || !githubOwner || !githubRepo) && (
                          <p className="text-[9px] text-yellow-500/70 text-center mt-2">
                            Configure GitHub settings to enable PR creation.
                          </p>
                        )}
                      </div>
                    )}

                    <section className="space-y-2">
                      <h3 className="text-xs font-bold flex items-center gap-2 text-white/80">
                        <Info className="w-4 h-4 text-blue-400" />
                        Prevention Strategy
                      </h3>
                      <p className="text-white/40 text-[10px] lg:text-xs leading-relaxed">{debugResult.prevention}</p>
                    </section>

                    {debugResult.confidence < 0.9 && (
                      <div className="pt-4 border-t border-white/5">
                        <button 
                          onClick={() => {
                            setNewRule({
                              pattern: payload.message.substring(0, 30),
                              fix: debugResult.fix || debugResult.rootCause,
                              fixType: debugResult.fixType
                            });
                            setActiveTab('rules');
                          }}
                          className="w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-blue-500/20"
                        >
                          <Book className="w-4 h-4" />
                          Add to Rule Engine
                        </button>
                        <p className="text-[9px] text-white/30 text-center mt-2">
                          Teach the local engine how to handle this error next time.
                        </p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-white/5 rounded-3xl min-h-[300px]">
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
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-bold mb-2">Fix History</h2>
                  <p className="text-white/50 text-sm lg:text-base">Memory of previous autonomous debugging sessions.</p>
                </div>
                <div className="text-left sm:text-right flex flex-col items-end gap-2">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl lg:text-4xl font-bold text-blue-500">{history.length}</span>
                    <p className="text-[9px] lg:text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Total Fixes</p>
                  </div>
                  <button 
                    onClick={handleClearHistory}
                    className="text-[10px] text-white/30 hover:text-red-400 transition-colors"
                  >
                    Clear History
                  </button>
                </div>
              </header>

              <div className="space-y-3 lg:space-y-4">
                {history.length > 0 ? history.map((item, idx) => (
                  <div key={idx} className="p-4 lg:p-6 bg-[#0F0F11] border border-white/5 rounded-2xl flex items-center gap-4 lg:gap-6 group hover:border-blue-500/30 transition-all">
                    <div className="p-2 lg:p-3 bg-white/5 rounded-xl text-blue-400 group-hover:bg-blue-500/10 transition-colors shrink-0">
                      {item.fixType === 'Database' ? <Database className="w-5 h-5 lg:w-6 lg:h-6" /> : 
                       item.fixType === 'UI' ? <Layout className="w-5 h-5 lg:w-6 lg:h-6" /> : <Code className="w-5 h-5 lg:w-6 lg:h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                        <h3 className="font-bold text-white/90 truncate text-sm lg:text-base">{item.error_type}</h3>
                        <span className="text-[9px] lg:text-[10px] text-white/30 font-mono">{new Date(item.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-xs lg:text-sm text-white/40 truncate">{item.message}</p>
                    </div>
                    <div className="hidden sm:block text-right shrink-0">
                      <span className="px-3 py-1 bg-white/5 rounded-full text-[9px] lg:text-[10px] font-bold uppercase tracking-wider text-white/60">
                        {item.fixType}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-white/10 group-hover:text-blue-500 transition-colors shrink-0" />
                  </div>
                )) : (
                  <div className="text-center p-12 bg-[#0F0F11] border border-white/5 rounded-3xl">
                    <History className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="text-white/30">No history found yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'setup' && (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-2xl lg:text-3xl font-bold mb-2">Supabase Webhook Setup</h2>
                <p className="text-white/50 text-sm lg:text-base">Connect your School ERP to the AI Debugger via database webhooks.</p>
              </header>

              <div className="grid grid-cols-1 gap-6">
                <div className="p-6 lg:p-8 bg-[#0F0F11] border border-white/5 rounded-3xl space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-600/20 rounded-lg">
                      <Database className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold">1. Configure Webhook</h3>
                  </div>
                  
                  <div className="space-y-4 text-sm lg:text-base text-white/70 leading-relaxed">
                    <p>In your Supabase Dashboard, navigate to <strong>Database &gt; Webhooks</strong> and create a new webhook with these settings:</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Name</h4>
                        <span className="text-sm font-mono text-blue-300">AI_Debugger_Sync</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Table</h4>
                        <span className="text-sm font-mono text-blue-300">error_logs</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Events</h4>
                        <span className="text-sm font-mono text-blue-300">INSERT</span>
                      </div>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Method</h4>
                        <span className="text-sm font-mono text-blue-300">POST</span>
                      </div>
                    </div>

                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mt-4">
                      <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Webhook URL</h4>
                      <div className="flex items-center gap-3">
                        <code className="text-xs lg:text-sm font-mono text-blue-300 break-all bg-black/40 p-2 rounded-lg flex-1">
                          {webhookUrl}
                        </code>
                        <button 
                          onClick={() => navigator.clipboard.writeText(webhookUrl)}
                          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold transition-all shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 lg:p-8 bg-[#0F0F11] border border-white/5 rounded-3xl space-y-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-600/20 rounded-lg">
                      <Shield className="w-6 h-6 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold">2. Expected Payload</h3>
                  </div>
                  
                  <div className="space-y-4 text-sm lg:text-base text-white/70 leading-relaxed">
                    <p>Your <code>error_logs</code> table structure is fully supported. The AI will analyze these key columns:</p>
                    <ul className="list-disc list-inside space-y-2 ml-2 text-white/50">
                      <li><code className="text-blue-300">error_type</code> (text) - e.g., "Supabase 400", "RLS Violation"</li>
                      <li><code className="text-blue-300">message</code> (text) - The raw error message</li>
                      <li><code className="text-blue-300">module</code> (text) - ERP module name (e.g., "Admissions")</li>
                      <li><code className="text-blue-300">user_context</code> (jsonb) - User role and ID</li>
                      <li><code className="text-blue-300">severity</code> (text) - "low", "medium", "high"</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'rules' && (
            <motion.div 
              key="rules"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-2xl lg:text-3xl font-bold mb-2">Local Rule Engine</h2>
                <p className="text-white/50 text-sm lg:text-base">Manage autonomous debugging rules that work without AI.</p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <form onSubmit={handleAddRule} className="p-6 bg-[#0F0F11] border border-white/5 rounded-3xl space-y-4">
                    <h3 className="font-bold text-lg">Add New Rule</h3>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Error Pattern</label>
                      <input 
                        value={newRule.pattern}
                        onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                        placeholder="e.g., duplicate key"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Fix Type</label>
                      <select 
                        value={newRule.fixType}
                        onChange={(e) => setNewRule({ ...newRule, fixType: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      >
                        <option value="Code">Code</option>
                        <option value="Database">Database</option>
                        <option value="UI">UI</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Suggested Fix</label>
                      <textarea 
                        value={newRule.fix}
                        onChange={(e) => setNewRule({ ...newRule, fix: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm focus:border-blue-500/50 outline-none transition-all h-24"
                        placeholder="Describe the fix..."
                      />
                    </div>
                    <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all">
                      Save Rule
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <h3 className="font-bold text-lg px-2">Active Rules ({rules.length})</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {rules.map((rule, idx) => (
                      <div key={idx} className="p-4 bg-[#0F0F11] border border-white/5 rounded-2xl flex items-start gap-4 group relative">
                        <div className="p-2 bg-white/5 rounded-lg text-blue-400 shrink-0">
                          {rule.fixType === 'Database' ? <Database className="w-5 h-5" /> : <Code className="w-5 h-5" />}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-white/90 text-sm mb-1">{rule.pattern}</h4>
                          <p className="text-xs text-white/40 leading-relaxed">{rule.fix}</p>
                        </div>
                        <button 
                          onClick={() => handleDeleteRule(idx)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-white/20 hover:text-red-400 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <header>
                <h2 className="text-2xl lg:text-3xl font-bold mb-2">Application Settings</h2>
                <p className="text-white/50 text-sm lg:text-base">Configure your AI Debugger environment.</p>
              </header>

              <div className="p-6 lg:p-8 bg-[#0F0F11] border border-white/5 rounded-3xl space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-600/20 rounded-lg">
                    <Shield className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold">API Configuration</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex justify-between">
                      <span>Gemini API Key</span>
                      {apiKey ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Configured
                        </span>
                      ) : (
                        <span className="text-yellow-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Required
                        </span>
                      )}
                    </label>
                    <input 
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all font-mono"
                      placeholder="Enter your Gemini API key..."
                    />
                    <p className="text-[10px] text-white/30 leading-relaxed">
                      This key is stored locally in your browser and used to authenticate requests to the Gemini AI. 
                      You can get a key from the <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Google AI Studio</a>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 lg:p-8 bg-[#0F0F11] border border-white/5 rounded-3xl space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <GitPullRequest className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold">GitHub Integration</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Repository Owner</label>
                    <input 
                      value={githubOwner}
                      onChange={(e) => setGithubOwner(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      placeholder="e.g., octocat"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Repository Name</label>
                    <input 
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all"
                      placeholder="e.g., my-erp-app"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Personal Access Token</label>
                  <input 
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500/50 outline-none transition-all font-mono"
                    placeholder="ghp_xxxxxxxxxxxx"
                  />
                  <p className="text-[10px] text-white/30 leading-relaxed">
                    Requires <code>repo</code> scope to create branches and pull requests.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
