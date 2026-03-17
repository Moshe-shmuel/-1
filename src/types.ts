
export interface ReviewItem {
  fileIdx: number;
  paragraphIdx: number;
  originalText: string;
  sourceText: string;
  sourceContext: string;
  explodedWordCount: number;
  wordMap: number[];
  originalWords: string[];
  headerText?: string;
  fullHeader?: string;
  sourceLineIndex?: number;
  mainSourceLineIndex?: number;
  mainSourceHeader?: string;
  targetName?: string;
}

export type TabId = 'process' | 'replace' | 'global' | 'split' | 'sync_h1' | 'fix' | 'preview' | 'highlight_regex' | 'highlight_fuzzy' | 'review';

export interface ProcessedFile {
  name: string;
  content: string;
  originalName?: string;
  links?: any[];
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface HierarchySkip {
  h1: boolean;
  h2: boolean;
  h3: boolean;
}
