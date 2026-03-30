import { GoogleGenAI } from "@google/genai";
import { ErrorPayload, DebugResult } from "./RuleEngine.ts";
import { MemoryManager } from "./MemoryManager.ts";

export class GeminiDebugger {
  private ai: GoogleGenAI;

  constructor(private memoryManager: MemoryManager) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async analyzeError(payload: ErrorPayload): Promise<DebugResult> {
    const schema = await this.memoryManager.getSchemaKnowledge();
    const history = await this.memoryManager.getFixHistory();

    const prompt = `
      You are a Senior System Architect and Autonomous AI Debugger for a Supabase-based School Management System (ERP).
      Your goal is to analyze incoming error logs and provide 'Ready-to-Use' fixes that are precise, technical, and cost-effective.

      KNOWLEDGE BASE:
      - Database Structure (Schema): ${JSON.stringify(schema)}
      - Fix History (Past Errors): ${JSON.stringify(history.slice(-10))}

      INSTRUCTIONS:
      1. Analyze the 'stack trace' if provided to find the exact file and line number.
      2. If the error is 'Permission Denied' or 'RLS' (Row Level Security) related, look at the Supabase policies in the schema and suggest the EXACT SQL command to fix it.
      3. Focus on fixes that don't cost money to implement (e.g., code logic, schema adjustments, RLS policies).
      4. Maintain a professional, senior architect tone: precise and technical.

      ERROR PAYLOAD:
      ${JSON.stringify(payload, null, 2)}

      OUTPUT FORMAT (Strict JSON):
      {
        "rootCause": "What actually broke? (Detailed technical explanation)",
        "fixType": "Database | Code | UI",
        "codeChanges": "The exact code or SQL command to copy-paste",
        "why": "Technical explanation of why this fix works",
        "prevention": "Strategy to prevent this error in the future",
        "confidence": 0.0 to 1.0
      }
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    try {
      const result = JSON.parse(response.text);
      return result;
    } catch (e) {
      return {
        rootCause: "AI analysis failed to produce valid JSON",
        fixType: "Code",
        fix: "Check system logs and retry analysis.",
        filesToUpdate: [],
        codeChanges: "",
        why: "The AI response was malformed.",
        prevention: "Improve AI prompt or check connectivity.",
        confidence: 0.1,
      };
    }
  }
}
