import { DebugPattern, MemoryManager } from './MemoryManager.ts';

export interface ErrorPayload {
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

export interface DebugResult {
  rootCause: string;
  fixType: 'query' | 'schema' | 'rls' | 'ui' | 'logic';
  fix: string;
  filesToUpdate: string[];
  codeChanges: string;
  why: string;
  prevention: string;
  confidence: number;
}

export class RuleEngine {
  constructor(private memoryManager: MemoryManager) {}

  async checkRules(payload: ErrorPayload): Promise<DebugResult | null> {
    const patterns = await this.memoryManager.getDebugPatterns();
    const message = payload.message.toLowerCase();

    for (const pattern of patterns) {
      if (message.includes(pattern.pattern.toLowerCase())) {
        return {
          rootCause: `Matched known pattern: ${pattern.pattern}`,
          fixType: pattern.fixType as any,
          fix: pattern.fix,
          filesToUpdate: [],
          codeChanges: "// Check Supabase/RLS configuration",
          why: "This error matches a recurring pattern in the ERP system.",
          prevention: "Regularly audit RLS policies and query structures.",
          confidence: 0.9,
        };
      }
    }

    return null;
  }
}
