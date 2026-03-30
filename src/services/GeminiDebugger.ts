import { GoogleGenAI } from "@google/genai";
import { ErrorPayload, DebugResult } from "./RuleEngine.ts";
import { MemoryManager } from "./MemoryManager.ts";

export class GeminiDebugger {
  private ai: GoogleGenAI | null = null;

  constructor(private memoryManager: MemoryManager) {}

  private getAI(overrideApiKey?: string): GoogleGenAI {
    const apiKey = overrideApiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEY is not configured. Please set it in the Settings tab or the environment.');
    }
    
    return new GoogleGenAI({ apiKey });
  }

  async analyzeError(payload: ErrorPayload, overrideApiKey?: string): Promise<DebugResult> {
    try {
      const ai = this.getAI(overrideApiKey);
      const schema = await this.memoryManager.getSchemaKnowledge();
      const history = await this.memoryManager.getFixHistory();

      const prompt = `
        You are a Senior System Architect and Autonomous AI Debugger for a Supabase-based School Management System (ERP).
        Your goal is to analyze incoming error logs and provide 'Ready-to-Use' fixes that are precise, technical, and cost-effective.

        CONTEXT:
        - User Role: ${payload.userRole || 'Unknown'}
        - Module: ${payload.moduleName || 'Unknown'}
        - Component: ${payload.componentName || 'Unknown'}
        - Action: ${payload.action || 'Unknown'}
        - Status Code: ${payload.statusCode || 'N/A'}
        - Schema Context: ${payload.schemaContext || 'N/A'}

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
          "filePath": "The path to the file that needs to be updated (if applicable)",
          "fullFileContent": "The COMPLETE content of the file AFTER the fix is applied (MANDATORY for Code/UI fixes)",
          "codeChanges": "The exact code or SQL command to copy-paste",
          "why": "Technical explanation of why this fix works",
          "prevention": "Strategy to prevent this error in the future",
          "confidence": 0.0 to 1.0
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const result = JSON.parse(response.text);
      return result;
    } catch (e: any) {
      return {
        rootCause: e.message || "AI analysis failed",
        fixType: "Code",
        fix: "Please configure your Gemini API key in Settings or add a manual rule for this pattern in the Rule Engine.",
        filesToUpdate: [],
        codeChanges: "",
        why: "The AI analysis could not be completed because the API key is missing or invalid.",
        prevention: "Use the Rule Engine to define local fixes for recurring errors.",
        confidence: 0,
      };
    }
  }
}
