import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import fs from 'fs-extra';
import { createServer as createViteServer } from 'vite';
import { MemoryManager } from './src/services/MemoryManager.ts';
import { RuleEngine, ErrorPayload } from './src/services/RuleEngine.ts';
import { GeminiDebugger } from './src/services/GeminiDebugger.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(bodyParser.json());

  const memoryManager = new MemoryManager();
  const ruleEngine = new RuleEngine(memoryManager);
  const geminiDebugger = new GeminiDebugger(memoryManager);

  // API Endpoint to receive ERP error logs
  app.post('/api/debug', async (req, res) => {
    const payload: ErrorPayload = req.body;

    try {
      // 1. Check Rule Engine first
      let result = await ruleEngine.checkRules(payload);

      // 2. Fallback to AI reasoning if no rule applies
      if (!result) {
        result = await geminiDebugger.analyzeError(payload);
      }

      // 3. Store solution in memory for future reuse
      await memoryManager.addFixToHistory({
        errorType: payload.errorType,
        message: payload.message,
        rootCause: result.rootCause,
        fixType: result.fixType,
        fix: result.fix,
        codeChanges: result.codeChanges,
        timestamp: new Date().toISOString(),
      });

      res.json(result);
    } catch (error) {
      console.error('Debug Error:', error);
      res.status(500).json({ error: 'Failed to process error log' });
    }
  });

  // Get Fix History
  app.get('/api/history', async (req, res) => {
    const history = await memoryManager.getFixHistory();
    res.json(history);
  });

  // Get Checklist
  app.get('/api/checklist', async (req, res) => {
    const checklistPath = path.join(process.cwd(), 'src/memory/checklist.json');
    const checklist = await fs.readJson(checklistPath);
    res.json(checklist);
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
