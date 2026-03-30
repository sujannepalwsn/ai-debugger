import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs-extra';
import { createServer as createViteServer } from 'vite';
import { MemoryManager } from './src/services/MemoryManager.ts';
import { RuleEngine, ErrorPayload } from './src/services/RuleEngine.ts';
import { GeminiDebugger } from './src/services/GeminiDebugger.ts';
import { Octokit } from 'octokit';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json());

  const memoryManager = new MemoryManager();
  const ruleEngine = new RuleEngine(memoryManager);
  const geminiDebugger = new GeminiDebugger(memoryManager);

  // Error Queue for Batch Processing
  const errorQueue: ErrorPayload[] = [];
  let isProcessingQueue = false;

  const processQueue = async () => {
    if (isProcessingQueue || errorQueue.length === 0) return;
    isProcessingQueue = true;

    while (errorQueue.length > 0) {
      const payload = errorQueue.shift();
      if (!payload) continue;

      try {
        // 1. Check Rule Engine
        let result = await ruleEngine.checkRules(payload);

        // 2. AI Fallback (if enabled/configured)
        if (!result) {
          try {
            // We use a default key if available, or skip if not
            result = await geminiDebugger.analyzeError(payload);
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

        // 3. Store in History
        await memoryManager.addFixToHistory({
          error_type: payload.errorType,
          message: payload.message,
          rootCause: result.rootCause,
          fixType: result.fixType,
          fix: result.fix || "",
          codeChanges: result.codeChanges,
          timestamp: new Date().toISOString(),
        });

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
        }
      } catch (err) {
        console.error('Queue Processing Error:', err);
      }
    }

    isProcessingQueue = false;
  };

  // API Endpoint to receive ERP error logs (Non-blocking)
  app.post('/api/debug', async (req, res) => {
    // Handle Supabase Webhook payload or direct ErrorPayload
    const payload: ErrorPayload = req.body.record || req.body;

    if (!payload.message) {
      return res.status(400).json({ error: 'Invalid error payload: message is required' });
    }

    // Push to queue and respond immediately
    errorQueue.push(payload);
    processQueue(); // Start processing in background

    res.json({ status: 'queued', message: 'Error received and queued for autonomous analysis' });
  });

  app.post('/api/create-pr', async (req, res) => {
    const { githubToken, owner, repo, filePath, content, title, body, branchName } = req.body;

    if (!githubToken || !owner || !repo || !filePath || !content) {
      return res.status(400).json({ error: 'Missing required GitHub parameters' });
    }

    try {
      const octokit = new Octokit({ auth: githubToken });

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
    const checklistPath = path.join(process.cwd(), 'src/memory/checklist.json');
    const checklist = await fs.readJson(checklistPath);
    res.json(checklist);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Autonomous AI Debugger running on http://localhost:${PORT}`);
  });
}

startServer();
