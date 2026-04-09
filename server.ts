import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs-extra';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import { MemoryManager } from './src/services/MemoryManager.ts';
import { RuleEngine, ErrorPayload } from './src/services/RuleEngine.ts';
import { GeminiDebugger } from './src/services/GeminiDebugger.ts';
import { RLSGenerator } from './src/services/RLSGenerator.ts';
import { Octokit } from 'octokit';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json());

  const memoryManager = new MemoryManager();
  const ruleEngine = new RuleEngine(memoryManager);
  const geminiDebugger = new GeminiDebugger(memoryManager);
  const rlsGenerator = new RLSGenerator();

  // Supabase Client Initialization (Lazy)
  let supabase: any = null;
  const getSupabase = () => {
    if (supabase) return supabase;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabase = createClient(url, key);
      return supabase;
    }
    return null;
  };

  app.post('/api/generate-rls', async (req, res) => {
    try {
      const files = await rlsGenerator.fetchRepositoryFiles();
      const schema = await rlsGenerator.fetchSupabaseSchema();
      const policies = await rlsGenerator.generateRLSPolicies(files, schema);
      res.json(policies);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to generate RLS policies' });
    }
  });
  interface QueuedError {
    payload: ErrorPayload;
    apiKey?: string;
  }
  const errorQueue: QueuedError[] = [];
  let isProcessingQueue = false;

  const processQueue = async () => {
    if (isProcessingQueue || errorQueue.length === 0) return;
    isProcessingQueue = true;

    while (errorQueue.length > 0) {
      const item = errorQueue.shift();
      if (!item) continue;
      const { payload, apiKey } = item;

      // Notify frontend that we are analyzing
      io.emit('analyzing_error', { message: payload.message, timestamp: new Date().toISOString() });

      try {
        // 1. Check Rule Engine
        let result = await ruleEngine.checkRules(payload);

        // 2. AI Fallback (if enabled/configured)
        if (!result) {
          try {
            // Step 1: Initial analysis to identify filePath
            result = await geminiDebugger.analyzeError(payload, apiKey);

            // Step 2: If filePath is identified, fetch content from GitHub and re-analyze
            if (result.filePath && !result.fullFileContent) {
              const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
              const owner = process.env.GITHUB_OWNER;
              const repo = process.env.GITHUB_REPO;

              if (token && owner && repo) {
                try {
                  const octokit = new Octokit({ auth: token });
                  const { data: fileData } = await octokit.rest.repos.getContent({
                    owner,
                    repo,
                    path: result.filePath,
                  });

                  if (!Array.isArray(fileData) && fileData.type === 'file' && fileData.content) {
                    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
                    // Re-analyze with source code
                    const refinedResult = await geminiDebugger.analyzeError(payload, apiKey, content);
                    if (refinedResult.confidence >= result.confidence) {
                      result = refinedResult;
                    }
                  }
                } catch (githubErr) {
                  console.warn('Failed to fetch file from GitHub for refined analysis:', githubErr);
                }
              }
            }
          } catch (e) {
            console.warn('AI Fallback failed, using generic fix');
            result = {
              rootCause: "Unknown error pattern detected in local mode.",
              fixType: "Code",
              fix: "Review logs and add a manual rule to the engine.",
              codeChanges: "",
              why: "No matching rule found and AI analysis is unavailable.",
              prevention: "Update the Rule Engine with this specific pattern.",
              confidence: 0.1
            };
          }
        }

        // 3. Automatic PR Creation (if enabled and confidence is high)
        if (result.filePath && result.fullFileContent && result.confidence > 0.9 && process.env.AUTO_PR === 'true') {
          const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
          const owner = process.env.GITHUB_OWNER;
          const repo = process.env.GITHUB_REPO;

          if (token && owner && repo) {
            try {
              const octokit = new Octokit({ auth: token });
              const branchName = `fix-${Date.now()}`;
              
              const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
              const defaultBranch = repoData.default_branch;
              
              const { data: refData } = await octokit.rest.git.getRef({
                owner,
                repo,
                ref: `heads/${defaultBranch}`,
              });
              
              await octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha: refData.object.sha,
              });
              
              const { data: currentFile } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path: result.filePath,
              });
              
              await octokit.rest.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: result.filePath,
                message: `Fix: ${payload.errorType} - ${result.rootCause}`,
                content: Buffer.from(result.fullFileContent).toString('base64'),
                sha: !Array.isArray(currentFile) ? currentFile.sha : undefined,
                branch: branchName,
              });
              
              const { data: pr } = await octokit.rest.pulls.create({
                owner,
                repo,
                title: `[Auto-Fix] ${payload.errorType}`,
                body: `### AI Debugger Auto-Fix\n\n**Root Cause:** ${result.rootCause}\n\n**Fix:** ${result.fix || result.why}\n\n**Prevention:** ${result.prevention}`,
                head: branchName,
                base: defaultBranch,
              });
              
              console.log(`Auto-PR created: ${pr.html_url}`);
              io.emit('auto_pr_created', { url: pr.html_url, message: `Auto-PR created for ${payload.errorType}` });
            } catch (prErr) {
              console.error('Failed to create Auto-PR:', prErr);
            }
          }
        }

        // 3. Store in History
        const fixData = {
          error_type: payload.errorType,
          message: payload.message,
          rootCause: result.rootCause,
          fixType: result.fixType,
          fix: result.fix || "",
          codeChanges: result.codeChanges,
          timestamp: new Date().toISOString(),
        };
        await memoryManager.addFixToHistory(fixData);

        // Notify frontend that analysis is complete
        io.emit('new_fix', fixData);

        // 4. Self-Learning: If confidence is high and it's a new pattern, add to rules
        if (result.confidence > 0.85) {
          const patterns = await memoryManager.getDebugPatterns();
          const exists = patterns.some(p => p.pattern.toLowerCase() === payload.message.toLowerCase());
          if (!exists) {
            await memoryManager.addDebugPattern({
              pattern: payload.message,
              fix: result.fix || result.rootCause,
              fixType: result.fixType.toLowerCase()
            });
          }
        } else if (result.confidence === 0) {
          // Confidence 0 usually means an error occurred (like invalid API key)
          io.emit('analysis_failed', { 
            message: payload.message, 
            error: result.rootCause,
            timestamp: new Date().toISOString() 
          });
        }
      } catch (err) {
        console.error('Queue Processing Error:', err);
      }
    }

    isProcessingQueue = false;
  };

  app.get('/api/config', (req, res) => {
    const hasGithubToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_ACCESS_TOKEN);
    res.json({
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      hasGithubToken,
      hasGithubOwner: !!process.env.GITHUB_OWNER,
      hasGithubRepo: !!process.env.GITHUB_REPO,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasSupabaseTable: !!process.env.SUPABASE_ERROR_TABLE,
      autoPr: process.env.AUTO_PR === 'true',
    });
  });

  app.post('/api/save-config', async (req, res) => {
    res.status(403).json({ error: 'Configuration must be managed via environment variables in the AI Studio settings.' });
  });

  // API Endpoint to receive ERP error logs (Non-blocking)
  app.post('/api/debug', async (req, res) => {
    // Handle Supabase Webhook payload or direct ErrorPayload
    const payload: ErrorPayload = req.body.record || req.body;

    if (!payload.message) {
      return res.status(400).json({ error: 'Invalid error payload: message is required' });
    }

    // Push to queue and respond immediately
    const apiKey = req.headers['x-gemini-api-key'] as string;
    errorQueue.push({ payload, apiKey });
    
    // Notify frontend that an error was received
    io.emit('error_received', { ...payload, timestamp: new Date().toISOString() });
    
    processQueue(); // Start processing in background

    res.json({ status: 'queued', message: 'Error received and queued for autonomous analysis' });
  });

  app.post('/api/create-pr', async (req, res) => {
    const { 
      githubToken: clientToken, 
      owner: clientOwner, 
      repo: clientRepo, 
      filePath, 
      content, 
      title, 
      body, 
      branchName 
    } = req.body;

    const token = clientToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_ACCESS_TOKEN;
    const owner = clientOwner || process.env.GITHUB_OWNER;
    const repo = clientRepo || process.env.GITHUB_REPO;

    if (!token || !owner || !repo || !filePath || !content) {
      return res.status(400).json({ error: 'Missing required GitHub parameters (Token, Owner, or Repo)' });
    }

    try {
      const octokit = new Octokit({ auth: token });

      // 1. Get default branch
      const { data: repository } = await octokit.rest.repos.get({ owner, repo });
      const defaultBranch = repository.default_branch;

      // 2. Get latest commit SHA from default branch
      const { data: ref } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${defaultBranch}`,
      });
      const latestCommitSha = ref.object.sha;

      // 3. Create a new branch
      const newBranchName = branchName || `fix/ai-debugger-${Date.now()}`;
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranchName}`,
        sha: latestCommitSha,
      });

      // 4. Get file SHA (if it exists)
      let fileSha;
      try {
        const { data: fileData } = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: newBranchName,
        });
        if (!Array.isArray(fileData)) {
          fileSha = fileData.sha;
        }
      } catch (e) {
        // File doesn't exist yet, that's fine
      }

      // 5. Create or update file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: title || 'Fix: AI Debugger Suggested Change',
        content: Buffer.from(content).toString('base64'),
        branch: newBranchName,
        sha: fileSha,
      });

      // 6. Create Pull Request
      const { data: pr } = await octokit.rest.pulls.create({
        owner,
        repo,
        title: title || 'Fix: AI Debugger Suggested Change',
        body: body || 'This PR was automatically generated by the AI Debugger.',
        head: newBranchName,
        base: defaultBranch,
      });

      res.json({ prUrl: pr.html_url });
    } catch (error: any) {
      console.error('GitHub PR Error:', error);
      res.status(500).json({ error: error.message || 'Failed to create Pull Request' });
    }
  });

  // Get Fix History
  app.get('/api/history', async (req, res) => {
    const history = await memoryManager.getFixHistory();
    res.json(history);
  });

  // Clear Fix History
  app.delete('/api/history', async (req, res) => {
    try {
      const historyPath = path.join(process.cwd(), 'src/memory/fix_history.json');
      await fs.writeJson(historyPath, [], { spaces: 2 });
      res.json({ status: 'success' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to clear history' });
    }
  });

  // Get Checklist
  app.get('/api/checklist', async (req, res) => {
    try {
      console.log('Fetching checklist...');
      const checklistPath = path.join(process.cwd(), 'src/memory/checklist.json');
      if (await fs.pathExists(checklistPath)) {
        const checklist = await fs.readJson(checklistPath);
        console.log('Checklist found:', checklist.modules?.length || 0, 'modules');
        res.json(checklist);
      } else {
        console.log('Checklist file not found, returning empty');
        res.json({ modules: [] });
      }
    } catch (e) {
      console.error('Failed to read checklist:', e);
      res.status(500).json({ error: 'Failed to fetch checklist', modules: [] });
    }
  });

  // Get Rules
  app.get('/api/rules', async (req, res) => {
    const rules = await memoryManager.getDebugPatterns();
    res.json(rules);
  });

  // Add Rule
  app.post('/api/rules', async (req, res) => {
    const { pattern, fix, fixType } = req.body;
    try {
      await memoryManager.addDebugPattern({ pattern, fix, fixType });
      res.json({ status: 'success' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to add rule' });
    }
  });

  // Delete Rule
  app.delete('/api/rules/:index', async (req, res) => {
    const index = parseInt(req.params.index);
    try {
      const rules = await memoryManager.getDebugPatterns();
      rules.splice(index, 1);
      const rulesPath = path.join(process.cwd(), 'src/memory/debug_patterns.json');
      await fs.writeJson(rulesPath, rules, { spaces: 2 });
      res.json({ status: 'success' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  });

  // Ingest Real Schema from ERP
  app.post('/api/ingest-schema', async (req, res) => {
    const { tables, modules } = req.body;
    try {
      if (tables) await memoryManager.updateSchemaKnowledge({ tables });
      if (modules) await memoryManager.updateChecklist(modules);
      res.json({ status: 'success', message: 'ERP Schema and Modules synced successfully' });
    } catch (e) {
      res.status(500).json({ error: 'Failed to ingest schema' });
    }
  });

  // Sync Supabase Errors
  app.post('/api/sync-supabase', async (req, res) => {
    const sb = getSupabase();
    if (!sb) {
      return res.status(400).json({ error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
    }

    const tableName = process.env.SUPABASE_ERROR_TABLE || 'error_logs';
    try {
      const { data, error } = await sb
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        data.forEach((row: any) => {
          const payload: ErrorPayload = {
            errorType: row.error_type || row.type || 'Supabase Log',
            message: row.message || row.error_message || 'No message provided',
            moduleName: row.module_name || row.module || 'Unknown',
            severity: row.severity || 'medium',
            timestamp: row.created_at || new Date().toISOString(),
            payload: row
          };
          
          // Only queue if not already in queue
          const isQueued = errorQueue.some(q => q.payload.message === payload.message && q.payload.timestamp === payload.timestamp);
          if (!isQueued) {
            errorQueue.push({ payload, apiKey: process.env.GEMINI_API_KEY || '' });
            io.emit('error_received', { ...payload, source: 'supabase' });
          }
        });
        processQueue();
      }

      res.json({ status: 'success', count: data?.length || 0 });
    } catch (e: any) {
      console.error('Supabase Sync Error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Background Polling for Supabase (every 30 seconds)
  setInterval(async () => {
    const sb = getSupabase();
    if (!sb) return;

    const tableName = process.env.SUPABASE_ERROR_TABLE || 'error_logs';
    try {
      const { data, error } = await sb
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) return;

      if (data && data.length > 0) {
        let newErrors = false;
        data.forEach((row: any) => {
          const payload: ErrorPayload = {
            errorType: row.error_type || row.type || 'Supabase Log',
            message: row.message || row.error_message || 'No message provided',
            moduleName: row.module_name || row.module || 'Unknown',
            severity: row.severity || 'medium',
            timestamp: row.created_at || new Date().toISOString(),
            payload: row
          };
          
          const isQueued = errorQueue.some(q => q.payload.message === payload.message && q.payload.timestamp === payload.timestamp);
          if (!isQueued) {
            errorQueue.push({ payload, apiKey: process.env.GEMINI_API_KEY || '' });
            io.emit('error_received', { ...payload, source: 'supabase' });
            newErrors = true;
          }
        });
        if (newErrors) processQueue();
      }
    } catch (e) {
      // Silent fail for background polling
    }
  }, 30000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Autonomous AI Debugger running on http://localhost:${PORT}`);
  });
}

startServer();
