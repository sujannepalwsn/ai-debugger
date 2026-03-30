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
  fixType: 'Database' | 'Code' | 'UI';
  fix?: string;
  filesToUpdate?: string[];
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
        // Map old fix types to new ones if necessary
        let fixType: 'Database' | 'Code' | 'UI' = 'Code';
        if (pattern.fixType === 'rls' || pattern.fixType === 'query') fixType = 'Database';
        if (pattern.fixType === 'ui') fixType = 'UI';

        return {
          rootCause: `Matched known pattern: ${pattern.pattern}`,
          fixType: fixType,
          codeChanges: pattern.fix, // Use the fix from patterns as codeChanges
          why: "This error matches a recurring pattern in the ERP system.",
          prevention: "Regularly audit RLS policies and query structures.",
          confidence: 0.9,
        };
      }
    }

    return null;
  }
}
