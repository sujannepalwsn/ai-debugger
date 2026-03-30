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
      You are an Autonomous AI Debugger for a Supabase-based school management platform (ERP).
      Analyze the following error log and provide a structured fix.

      ERP CONTEXT:
      Modules: Lesson Plans, Activities, Notifications, Meetings, Reports, Discipline, etc.
      Roles: super_admin, admin, teacher, parent, student.
      Schema Knowledge: ${JSON.stringify(schema)}
      Recent Fix History: ${JSON.stringify(history.slice(-5))}

      ERROR PAYLOAD:
      ${JSON.stringify(payload, null, 2)}

      Respond ONLY with a JSON object in the following format:
      {
        "rootCause": "Detailed explanation of the root cause",
        "fixType": "query | schema | rls | ui | logic",
        "fix": "Step-by-step fix instructions",
        "filesToUpdate": ["list", "of", "files"],
        "codeChanges": "Exact code snippet or query update",
        "why": "Explanation of why this fix works",
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
        fixType: "logic",
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
