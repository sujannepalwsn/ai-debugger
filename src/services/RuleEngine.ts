import { DebugPattern, MemoryManager } from './MemoryManager.ts';

export interface ErrorPayload {
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

export interface DebugResult {
  rootCause: string;
  fixType: 'Database' | 'Code' | 'UI';
  fix?: string;
  filesToUpdate?: string[];
  filePath?: string;
  fullFileContent?: string;
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
          fix: pattern.fix,
          codeChanges: pattern.fix, // Use the fix from patterns as codeChanges
          why: "This error matches a recurring pattern in the ERP system.",
          prevention: "Regularly audit RLS policies and query structures.",
          confidence: 0.9,
        };
      }
    }

    // Offline "AI" Heuristics for Unknown Errors
    if (message.includes('rls') || message.includes('policy') || message.includes('permission denied')) {
      return {
        rootCause: "Database security policy restriction (RLS).",
        fixType: "Database",
        fix: "Check Supabase RLS policies for the table in question. Ensure the user has the correct role.",
        codeChanges: "ALTER POLICY \"policy_name\" ON \"table_name\" TO authenticated USING (auth.uid() = user_id);",
        why: "Supabase uses RLS to protect data; a missing or incorrect policy will block access.",
        prevention: "Always test RLS policies with different user roles during development.",
        confidence: 0.7
      };
    }

    if (message.includes('not found') || message.includes('404')) {
      return {
        rootCause: "Resource or endpoint not found.",
        fixType: "Code",
        fix: "Verify the endpoint URL and ensure the resource exists in the database.",
        codeChanges: "// Check API route or database record existence",
        why: "The requested resource is missing or the path is incorrect.",
        prevention: "Implement better error handling for missing resources and verify routes.",
        confidence: 0.6
      };
    }

    if (message.includes('null') || message.includes('undefined')) {
      return {
        rootCause: "Null or undefined value access.",
        fixType: "Code",
        fix: "Add null checks or optional chaining to the affected code block.",
        codeChanges: "const value = data?.property ?? defaultValue;",
        why: "The code is trying to access a property of an object that is null or undefined.",
        prevention: "Use TypeScript strict null checks and provide default values.",
        confidence: 0.8
      };
    }

    return null;
  }
}
