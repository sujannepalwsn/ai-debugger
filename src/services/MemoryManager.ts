import fs from 'fs-extra';
import path from 'path';

export interface FixHistoryEntry {
  errorType: string;
  message: string;
  rootCause: string;
  fixType: string;
  fix: string;
  codeChanges: string;
  timestamp: string;
}

export interface DebugPattern {
  pattern: string;
  fix: string;
  fixType: string;
}

export interface SchemaKnowledge {
  tables: Record<string, { description: string; roles: string[] }>;
}

export class MemoryManager {
  private fixHistoryPath = path.join(process.cwd(), 'src/memory/fix_history.json');
  private debugPatternsPath = path.join(process.cwd(), 'src/memory/debug_patterns.json');
  private schemaKnowledgePath = path.join(process.cwd(), 'src/memory/schema_knowledge.json');

  async getFixHistory(): Promise<FixHistoryEntry[]> {
    return fs.readJson(this.fixHistoryPath);
  }

  async addFixToHistory(entry: FixHistoryEntry): Promise<void> {
    const history = await this.getFixHistory();
    history.push(entry);
    await fs.writeJson(this.fixHistoryPath, history, { spaces: 2 });
  }

  async getDebugPatterns(): Promise<DebugPattern[]> {
    return fs.readJson(this.debugPatternsPath);
  }

  async getSchemaKnowledge(): Promise<SchemaKnowledge> {
    return fs.readJson(this.schemaKnowledgePath);
  }

  async updateSchemaKnowledge(knowledge: SchemaKnowledge): Promise<void> {
    await fs.writeJson(this.schemaKnowledgePath, knowledge, { spaces: 2 });
  }

  async updateChecklist(modules: any[]): Promise<void> {
    const checklistPath = path.join(process.cwd(), 'src/memory/checklist.json');
    await fs.writeJson(checklistPath, { modules }, { spaces: 2 });
  }
}
