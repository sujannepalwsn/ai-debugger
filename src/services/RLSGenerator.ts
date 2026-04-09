import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs-extra";
import path from "path";

export class RLSGenerator {
  private ai: GoogleGenAI;
  private supabase: SupabaseClient;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    this.supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }

  async fetchRepositoryFiles(dir: string = "src"): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const absoluteDir = path.join(process.cwd(), dir);
    
    const scan = async (currentDir: string) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          const content = await fs.readFile(fullPath, "utf-8");
          const relativePath = path.relative(process.cwd(), fullPath);
          files[relativePath] = content;
        }
      }
    };
    
    await scan(absoluteDir);
    return files;
  }

  async fetchSupabaseSchema() {
    // Fetch all tables and their current RLS status
    const { data: tables, error } = await this.supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    
    if (error) throw error;
    
    // Note: Fetching RLS policies requires querying pg_policies
    // This is a simplified example; you might need a more robust query
    const { data: policies, error: policyError } = await this.supabase
      .rpc('get_all_policies'); // Assumes you have a helper function in Supabase
      
    return { tables, policies };
  }

  async generateRLSPolicies(repoFiles: Record<string, string>, schema: any) {
    const prompt = `
      You are a Senior Security Architect.
      Analyze the provided repository files and Supabase schema to generate secure RLS policies.
      
      REPOSITORY FILES:
      ${JSON.stringify(repoFiles, null, 2)}
      
      SUPABASE SCHEMA & POLICIES:
      ${JSON.stringify(schema, null, 2)}
      
      INSTRUCTIONS:
      1. Analyze how the application interacts with the database.
      2. Generate the SQL 'CREATE POLICY' statements for each table.
      3. Ensure policies are secure, follow least-privilege, and handle user ownership.
      4. Output the result as a JSON object with table names as keys and SQL code as values.
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    return JSON.parse(response.text);
  }
}
