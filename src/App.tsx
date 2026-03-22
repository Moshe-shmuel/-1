/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { isEqual } from 'lodash';
import * as fuzz from 'fuzzball';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wrench, Search, Globe, Scissors, Scale, Eye, 
  Upload, Folder, Trash2, Download, FileText, 
  CheckCircle, AlertCircle, ChevronRight, Menu,
  Settings, ListCheck, ArrowLeft, Play, Undo2, Filter, Type, X,
  Bold, Italic, Underline, RefreshCw, AArrowUp, AArrowDown,
  Highlighter, ArrowLeftRight, Plus, Minus
} from 'lucide-react';
import { ProcessedFile, TabId, LogEntry, ReviewItem } from './types';

// Extend window interface for global data
declare global {
  interface Window {
    appSources?: string[];
    appCategories?: Record<string, string[]>;
    appData?: Record<string, string>;
  }
}

const NavButton = ({ id, icon: Icon, label, onClick }: { id: TabId, icon: any, label: string, onClick: (id: TabId) => void }) => (
  <button
    onClick={() => onClick(id)}
    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-right text-slate-600 hover:bg-blue-50 hover:text-blue-600"
  >
    <Icon size={18} />
    <span className="font-semibold text-sm">{label}</span>
  </button>
);

const Modal = ({ isOpen, onClose, title, icon: Icon, children }: { isOpen: boolean, onClose: () => void, title: string, icon: any, children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Icon size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">{title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [loadedFiles, setLoadedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [history, setHistory] = useState<ProcessedFile[][]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('preview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [terminatorChar, setTerminatorChar] = useState('.:-');
  const [generateLinks, setGenerateLinks] = useState(false);
  
  // Review States
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [currentReviewBatch, setCurrentReviewBatch] = useState<ReviewItem[]>([]);
  const [reviewHeaders, setReviewHeaders] = useState<string[]>([]);
  const [currentHeaderIdx, setCurrentHeaderIdx] = useState(0);
  const [reviewGroups, setReviewGroups] = useState<Record<string, { fileIdx: number, pIdx: number, text: string }[]>>({});
  const [sourceSections, setSourceSections] = useState<{ header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[]>([]);

  // Highlighting States
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [sourceCache, setSourceCache] = useState<Record<string, string>>({});
  const [sourceContent, setSourceContent] = useState<string>('');
  const [localSource, setLocalSource] = useState<string>('');
  const [cursorLineIdx, setCursorLineIdx] = useState<number | null>(null);

  const activeSourceContent = localSource || sourceContent;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to load external JS data
  const loadExternalScript = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        resolve();
      };
      script.onerror = () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        reject(new Error(`Failed to load script: ${src}`));
      };
      document.head.appendChild(script);
    });
  };

  useEffect(() => {
    const initSources = async () => {
      console.log('Initializing sources from data/sources.js...');
      try {
        await loadExternalScript('data/sources.js');
        if (window.appCategories) {
          console.log('Loaded categories:', window.appCategories);
          setCategories(window.appCategories);
          const firstCat = Object.keys(window.appCategories)[0];
          if (firstCat) {
            setSelectedCategory(firstCat);
            const catSources = window.appCategories[firstCat];
            setSources(catSources);
            if (catSources.length > 0) {
              setSelectedSource(catSources[0]);
            }
          }
        } else if (window.appSources && Array.isArray(window.appSources)) {
          // Fallback for flat structure
          const cleanSources = window.appSources
            .filter((s: string) => !s.startsWith('רשי על') && !s.startsWith('תוספות על'));
          setSources(cleanSources);
          if (cleanSources.length > 0) {
            setSelectedSource(prev => prev || cleanSources[0]);
          }
        }
      } catch (e) {
        console.warn('Could not load data/sources.js, checking for manual upload.');
      }
    };
    initSources();
  }, []);

  // Update sources when category changes
  useEffect(() => {
    if (selectedCategory && categories[selectedCategory]) {
      const catSources = categories[selectedCategory];
      setSources(catSources);
      if (!catSources.includes(selectedSource)) {
        setSelectedSource(catSources[0] || '');
      }
    }
  }, [selectedCategory, categories]);

  useEffect(() => {
    const loadContent = async () => {
      if (selectedSource) {
        console.log(`Loading content for source: ${selectedSource}`);
        
        // Strip extension for internal keys (case-insensitive)
        const cleanName = selectedSource.replace(/\.[^/.]+$/, "");
        
        // Load main source if not local
        if (!localSource) {
          try {
            await loadExternalScript(`data/${cleanName}.js`);
            if (window.appData && window.appData[cleanName]) {
              const content = window.appData[cleanName];
              setSourceContent(content);
              setSourceCache(prev => ({ ...prev, [cleanName]: content }));
            }
          } catch (err) {
            console.error(`Error loading source ${cleanName}:`, err);
          }
        } else {
          // If local, ensure it's in cache
          setSourceCache(prev => ({ ...prev, [cleanName]: localSource }));
        }

        // Pre-fetch/load commentaries (always try to load from server)
        const rashiName = `רשי על ${cleanName}`;
        const tosafotName = `תוספות על ${cleanName}`;
        
        for (const name of [rashiName, tosafotName]) {
          try {
            await loadExternalScript(`data/${name}.js`);
            if (window.appData && window.appData[name]) {
              const content = window.appData[name];
              setSourceCache(prev => ({ ...prev, [name]: content }));
            }
          } catch (e) {
            // Ignore errors for optional commentaries
          }
        }
      }
    };
    loadContent();
  }, [selectedSource, localSource]);

  const currentFileContent = loadedFiles[previewIdx]?.content;

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      if (prev.length > 0 && isEqual(prev[0], loadedFiles)) {
        return prev;
      }
      return [loadedFiles, ...prev].slice(0, 20);
    });
  }, [loadedFiles]);


  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    pushToHistory();
    const newFiles: ProcessedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const content = await f.text();
      const cleanFileName = f.name.replace(/\.[^/.]+$/, "");
      newFiles.push({ 
        name: cleanFileName, 
        content: content,
        originalName: f.name
      });
    }
    setLoadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleContentChange = (newContent: string) => {
    const nextFiles = [...loadedFiles];
    if (nextFiles[previewIdx]) {
      nextFiles[previewIdx] = { ...nextFiles[previewIdx], content: newContent };
      setLoadedFiles(nextFiles);
    }
  };

  const handleNameChange = (newName: string) => {
    const nextFiles = [...loadedFiles];
    if (nextFiles[previewIdx]) {
      nextFiles[previewIdx] = { ...nextFiles[previewIdx], name: newName };
      setLoadedFiles(nextFiles);
    }
  };

  const updateCursorLine = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    const lineIdx = textBeforeCursor.split('\n').length - 1;
    setCursorLineIdx(lineIdx);
  };

  const parseSections = useCallback((content: string) => {
    const explode = (text: string, startLine: number) => {
      const lines = text.split('\n');
      return lines.flatMap((line, i) => {
        const cleanLine = line.replace(/<[^>]*>/g, '');
        const words = cleanLine.split(/\s+/).filter(w => w.length > 0);
        return words.map(w => ({ text: w, lineIdx: startLine + i }));
      });
    };

    const sections: { header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[] = [];
    const headerRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    
    let firstMatch = headerRegex.exec(content);
    headerRegex.lastIndex = 0; 
    
    if (firstMatch && firstMatch.index > 0) {
      const initialContent = content.substring(0, firstMatch.index);
      sections.push({ 
        header: "_initial_", 
        fullHeader: "",
        words: explode(initialContent, 1) 
      });
    } else if (!firstMatch) {
      sections.push({ 
        header: "_initial_", 
        fullHeader: "",
        words: explode(content, 1) 
      });
    }

    let match;
    const currentHierarchy: string[] = [];
    while ((match = headerRegex.exec(content)) !== null) {
      const level = parseInt(match[1]);
      const rawHeaderText = match[2].replace(/<[^>]*>/g, '').trim();
      const normalizedHeader = normalize(rawHeaderText, true);
      
      currentHierarchy[level - 1] = rawHeaderText;
      for (let i = level; i < 6; i++) currentHierarchy[i] = '';
      const hierarchyPath = currentHierarchy.filter(h => h).join(' ');

      const start = headerRegex.lastIndex;
      const currentPos = headerRegex.lastIndex;
      const nextMatch = headerRegex.exec(content);
      const end = nextMatch ? nextMatch.index : content.length;
      headerRegex.lastIndex = currentPos; 
      
      const sectionContent = content.substring(start, end);
      const headerLine = content.substring(0, match.index).split('\n').length;
      sections.push({
        header: normalizedHeader,
        fullHeader: hierarchyPath,
        words: explode(sectionContent, headerLine + 1)
      });
    }
    return sections;
  }, []);

  const getTargetSections = useCallback((p: string, baseSourceName: string, currentHeader: string, sectionsCache: Record<string, any[]>, lastType: 'tosafot' | 'rashi' | null) => {
    const prefixMatch = p.match(/^(תוס' ד"ה|תוד"ה|תוספות|רשד"ה|רש"י ד"ה|רש"י|פירש"י\s+ב?ד"ה|פרש"י\s+ב?ד"ה|ו?ב?תוספות\s+ב?ד"ה|ו?ב?תוס'\s+ב?ד"ה|שם\s+ב?ד"ה|ב?ד"ה|ד"ה|בא"ד|באו"ד|בגמרא|בגמ'|גמרא|גמ')(\s+|$)/);
    if (!prefixMatch) return null;
    
    const prefix = prefixMatch[1];
    if (prefix === 'בא"ד' || prefix === 'באו"ד') {
      return { isSameAsPrevious: true, prefix, type: lastType, sections: null, matchingSection: null };
    }

    // Identify the Gemara name and if the active file is a commentary
    const gemaraName = baseSourceName.replace(/^(תוספות על |רשי על |רש"י על |ר"שי על )/, "");
    const isActiveFileCommentary = baseSourceName !== gemaraName;

    let currentType: 'tosafot' | 'rashi' | null = null;

    if (prefix.includes('תוס') || prefix.includes('תוד')) {
      currentType = 'tosafot';
    } else if (prefix.includes('רש')) {
      currentType = 'rashi';
    } else if (prefix.includes('גמ')) {
      currentType = null; // Explicitly Gemara (main source)
    } else {
      // Generic prefix (ד"ה, שם בד"ה etc.)
      // If we are in a commentary file, default to Gemara (null)
      // Unless we have a lastType that was explicitly set in this paragraph sequence
      currentType = isActiveFileCommentary ? null : lastType;
    }

    const fullTargetName = !currentType ? gemaraName : (currentType === 'tosafot' ? `תוספות על ${gemaraName}` : `רשי על ${gemaraName}`);
    const shortTargetName = fullTargetName.split('/').pop() || fullTargetName;

    if (!currentType) return { sections: null, prefix, matchingSection: null, type: currentType, targetName: shortTargetName };
    
    if (sectionsCache[fullTargetName]) {
      const matchingSection = sectionsCache[fullTargetName].find((s: any) => s.header === currentHeader);
      return { sections: sectionsCache[fullTargetName], prefix, matchingSection, type: currentType, targetName: shortTargetName };
    }
    
    const content = sourceCache[fullTargetName];
    if (content) {
      const parsed = parseSections(content);
      sectionsCache[fullTargetName] = parsed;
      const matchingSection = parsed.find((s: any) => s.header === currentHeader);
      return { sections: parsed, prefix, matchingSection, type: currentType, targetName: shortTargetName };
    }

    return { sections: null, prefix, matchingSection: null, type: currentType, targetName: shortTargetName };
  }, [sourceCache, parseSections]);

  const undo = () => {
    if (history.length === 0) return;
    const previousState = history[0];
    setHistory(history.slice(1));
    setLoadedFiles(previousState);
  };

  const insertTag = (openTag: string, closeTag: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    pushToHistory();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const replacement = `${openTag}${selectedText}${closeTag}`;
    const newContent = text.substring(0, start) + replacement + text.substring(end);
    handleContentChange(newContent);
  };

  // פונקציית הנורמליזציה המעודכנת שמונעת הסרת אותיות מכותרות
  const normalize = (text: string, isHeader: boolean = false) => {
    if (!text) return '';
    let processed = text.replace(/[\u0591-\u05C7]/g, ''); // הסרת ניקוד
    
    // הסרת פיסוק רק אם זה לא כותרת
    if (!isHeader) {
      // לא מסירים גרשיים וגרש כאן כי הם משמשים ללוגיקה של ראשי תיבות וקיצורים
      processed = processed.replace(/[.,:;?!\-()]/g, ' ');
    }

    return processed
      .split(/\s+/)
      .map(word => {
        // התיקון: הסרת אותיות י' ו-ו' רק אם זו לא כותרת והמילה ארוכה מספיק
        if (!isHeader && word.length > 1) {
          return word.replace(/[וי]/g, '');
        }
        return word;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const checkMatch = (pWord: string, sWords: { text: string }[]) => {
    if (sWords.length === 0) return { matchCount: 0, consumedSource: 0 };

    const cleanP = pWord.replace(/[\u0591-\u05C7]/g, '');
    
    // 1. Acronym check: " before last letter
    if (cleanP.includes('"') && cleanP.length >= 3) {
      const quoteIdx = cleanP.indexOf('"');
      if (quoteIdx === cleanP.length - 2) {
        const letters = cleanP.replace(/"/g, '').split('');
        if (sWords.length >= letters.length) {
          let allMatch = true;
          for (let i = 0; i < letters.length; i++) {
            const pChar = letters[i];
            const sWordClean = sWords[i].text.replace(/[\u0591-\u05C7]/g, '');
            if (sWordClean.charAt(0) !== pChar) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) return { matchCount: 1, consumedSource: letters.length };
        }
      }
    }

    // 2. Abbreviation check: ' at end
    if (cleanP.endsWith("'") && cleanP.length > 1) {
      const prefix = cleanP.slice(0, -1);
      const sWordClean = sWords[0].text.replace(/[\u0591-\u05C7]/g, '');
      if (sWordClean.startsWith(prefix)) {
        return { matchCount: 1, consumedSource: 1 };
      }
    }

    // 3. Standard fuzzy match
    const pWordNorm = normalize(pWord.replace(/["']/g, ''));
    const sWordNorm = normalize(sWords[0].text.replace(/["']/g, ''));
    if (fuzz.ratio(pWordNorm, sWordNorm) >= 85) {
      return { matchCount: 1, consumedSource: 1 };
    }

    return { matchCount: 0, consumedSource: 0 };
  };

  const processWithRegex = () => {
    if (loadedFiles.length === 0) return;
    setIsProcessing(true);
    setProcessingProgress(0);
    
    setTimeout(async () => {
      pushToHistory();
      const escapedChars = terminatorChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^([^${escapedChars}]*[${escapedChars}])`);
      const nextFiles: ProcessedFile[] = [];

      for (let i = 0; i < loadedFiles.length; i++) {
        setProcessingProgress(Math.round((i / loadedFiles.length) * 100));
        await new Promise(resolve => setTimeout(resolve, 0));

        const f = loadedFiles[i];
        const paragraphs = f.content.split('\n');
        const newContent = paragraphs.map(p => {
          if (!p.trim()) return '';
          const cleanText = p.replace(/<[^>]*>/g, '');
          const match = cleanText.match(regex);
          if (match) {
            const dhmPlain = match[1];
            let plainIdx = 0;
            let originalIdx = 0;
            while (plainIdx < dhmPlain.length && originalIdx < p.length) {
              if (p[originalIdx] === '<') {
                while (originalIdx < p.length && p[originalIdx] !== '>') originalIdx++;
                originalIdx++;
              } else {
                plainIdx++;
                originalIdx++;
              }
            }
            const dhmPart = p.substring(0, originalIdx).replace(/<\/?b>/gi, '');
            const restPart = p.substring(originalIdx);
            return `<b>${dhmPart}</b>${restPart}`;
          }
          return p;
        }).join('\n');
        nextFiles.push({ ...f, content: newContent });
      }

      setLoadedFiles(nextFiles);
      setIsModalOpen(false);
      setIsProcessing(false);
      setProcessingProgress(0);
    }, 100);
  };

  const processWithFuzzy = (mode: 'auto' | 'review' = 'auto') => {
    if (!activeSourceContent) {
      return;
    }
    if (loadedFiles.length === 0) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);
    
    setTimeout(async () => {
      if (mode === 'auto') pushToHistory();

      const sections = parseSections(activeSourceContent);
      setSourceSections(sections);

      const sourceSectionsCache: Record<string, any[]> = { [selectedSource]: sections };
      const baseSourceName = selectedSource.replace(/\.[^/.]+$/, "");

      if (mode === 'review') {
        const groups: Record<string, { fileIdx: number, pIdx: number, text: string }[]> = {};
        const headersOrder: string[] = ["_initial_"];
        groups["_initial_"] = [];

        for (let fileIdx = 0; fileIdx < loadedFiles.length; fileIdx++) {
          const paragraphs = loadedFiles[fileIdx].content.split('\n');
          let currentHeader = "_initial_";
          paragraphs.forEach((p, pIdx) => {
            const trimmed = p.trim();
            if (!trimmed) return;

            const headerMatch = trimmed.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
            if (headerMatch) {
              // שמירת אותיות בכותרת הפרק
              currentHeader = normalize(headerMatch[1].replace(/<[^>]*>/g, ''), true);
              if (!groups[currentHeader]) {
                groups[currentHeader] = [];
                headersOrder.push(currentHeader);
              }
              return;
            }
            groups[currentHeader].push({ fileIdx, pIdx, text: p });
          });
        }

        const finalHeaders = headersOrder.filter(h => groups[h].length > 0);
        setReviewGroups(groups);
        setReviewHeaders(finalHeaders);
        setCurrentHeaderIdx(0);
        
        if (finalHeaders.length > 0) {
          processHeaderGroup(0, groups, finalHeaders, sections);
        } else {
          setIsProcessing(false);
        }
      } else {
        // Auto mode
        const nextFiles: ProcessedFile[] = [];

        for (let fileIdx = 0; fileIdx < loadedFiles.length; fileIdx++) {
          setProcessingProgress(Math.round((fileIdx / loadedFiles.length) * 100));
          await new Promise(resolve => setTimeout(resolve, 0));
          
          const f = loadedFiles[fileIdx];
          const paragraphs = f.content.split('\n');
          let currentSourceSection = sections[0];
          let currentSourceWords = currentSourceSection.words;
          let lastMatchIndex = 0; 
          let currentCommentaryHeader = "_initial_";
          let lastCommentaryType: 'tosafot' | 'rashi' | null = null;
          let lastLinkData: any = null;
          let lastMainLinkData: any = null;
          const fileLinks: any[] = [];
          
          const newContent = paragraphs.map((p, pIdx) => {
            const trimmed = p.trim();
            if (!trimmed) return '';

            const headerMatch = trimmed.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
            if (headerMatch) {
              const headerText = headerMatch[1].replace(/<[^>]*>/g, '');
              // Detect commentary type from header
              if (headerText.includes('תוס') || headerText.includes('תוד')) {
                lastCommentaryType = 'tosafot';
              } else if (headerText.includes('רש')) {
                lastCommentaryType = 'rashi';
              }

              currentCommentaryHeader = normalize(headerText, true);
              const matchingSection = sections.find(s => s.header === currentCommentaryHeader);
              if (matchingSection) {
                currentSourceSection = matchingSection;
                currentSourceWords = matchingSection.words;
                lastMatchIndex = 0; 
              }
              return p; 
            }

            const cleanP = trimmed.replace(/<[^>]*>/g, '');
            const originalWords = cleanP.split(/\s+/);
            
            const targetInfo = getTargetSections(cleanP, baseSourceName, currentCommentaryHeader, sourceSectionsCache, lastCommentaryType);
            
            if (targetInfo?.isSameAsPrevious && lastLinkData) {
              const prefixWords = targetInfo.prefix.split(/\s+/);
              const prefixWordCount = prefixWords.length;
              
              if (generateLinks) {
                fileLinks.push({ ...lastLinkData, line_index_1: pIdx + 1 });
                if (lastMainLinkData) {
                  fileLinks.push({ ...lastMainLinkData, line_index_1: pIdx + 1 });
                }
              }
              
              let currentWordIdx = -1;
              let inWord = false;
              let finalEndPos = 0;
              let inTag = false;

              for (let i = 0; i < p.length; i++) {
                if (p[i] === '<') inTag = true;
                if (!inTag) {
                  const isWhitespace = /\s/.test(p[i]);
                  if (!isWhitespace && !inWord) {
                    inWord = true;
                    currentWordIdx++;
                  } else if (isWhitespace && inWord) {
                    inWord = false;
                  }
                }
                if (currentWordIdx < prefixWordCount) finalEndPos = i + 1;
                else break;
                if (p[i] === '>') inTag = false;
              }
              while (finalEndPos < p.length && /[.:\-]/.test(p[finalEndPos])) finalEndPos++;
              
              const dhmPart = p.substring(0, finalEndPos).replace(/<\/?b>/gi, '');
              const restPart = p.substring(finalEndPos);
              return `<b>${dhmPart}</b>${restPart}`;
            }

            let effectiveSourceWords = currentSourceWords;
            let effectiveHeader = currentSourceSection.fullHeader;
            let prefixWordCount = 0;

            if (targetInfo) {
              lastCommentaryType = targetInfo.type;
              const prefixWords = targetInfo.prefix.split(/\s+/);
              prefixWordCount = prefixWords.length;
              if (targetInfo.matchingSection) {
                effectiveSourceWords = targetInfo.matchingSection.words;
                effectiveHeader = targetInfo.matchingSection.fullHeader;
              }
            }

            let candidates: { index: number, matchCount: number, consumedSource: number }[] = [];
            const searchWords = targetInfo ? originalWords.slice(prefixWordCount) : originalWords;

            for (let j = 0; j < effectiveSourceWords.length; j++) {
              let sourceOffset = 0;
              let matchedOriginalWords = 0;
              
              for (let k = 0; k < searchWords.length; k++) {
                const pWord = searchWords[k];
                const remainingSource = effectiveSourceWords.slice(j + sourceOffset);
                
                const match = checkMatch(pWord, remainingSource);
                if (match.consumedSource > 0) {
                  matchedOriginalWords++;
                  sourceOffset += match.consumedSource;
                } else {
                  break;
                }
              }
              
              if (matchedOriginalWords > 0) {
                candidates.push({ 
                  index: j, 
                  matchCount: matchedOriginalWords, 
                  consumedSource: sourceOffset 
                });
              }
            }

            let bestSourceIdx = -1;
            let maxMatchCount = 0;
            let bestScore = -Infinity;
            let bestConsumedSource = 0;

            candidates.forEach(candidate => {
              let score = candidate.matchCount;
              if (candidate.matchCount === 1) {
                const match = checkMatch(searchWords[0], effectiveSourceWords.slice(candidate.index));
                if (match.consumedSource === 1) {
                  const pWordNorm = normalize(searchWords[0].replace(/["']/g, ''));
                  const sWordNorm = normalize(effectiveSourceWords[candidate.index].text.replace(/["']/g, ''));
                  if (fuzz.ratio(pWordNorm, sWordNorm) < 92) {
                    score = -Infinity;
                  }
                }
              }

              if (score !== -Infinity) {
                  const distance = candidate.index - (targetInfo ? 0 : lastMatchIndex);
                  if (distance >= 0) {
                      score -= (distance * 0.005);
                  } else {
                      score -= 5;
                  }

                  if (score > bestScore) {
                      bestScore = score;
                      bestSourceIdx = candidate.index;
                      maxMatchCount = candidate.matchCount;
                      bestConsumedSource = candidate.consumedSource;
                  }
              }
            });

            if (maxMatchCount >= 1 || targetInfo) {
              let finalMatchCount = maxMatchCount;
              if (maxMatchCount >= 1) {
                // Check for "כו'" or "וכו'" immediately after the match
                if (maxMatchCount < searchWords.length) {
                  const nextWord = searchWords[maxMatchCount].replace(/[.,:;?!]/g, '');
                  if (nextWord === "כו'" || nextWord === "וכו'") {
                    finalMatchCount++;
                  }
                }
              } else if (targetInfo) {
                // Fallback: highlight prefix + 1 word
                finalMatchCount = 1;
              }

              const totalHighlightWords = prefixWordCount + finalMatchCount;
              
              if (maxMatchCount >= 1) {
                const matchedLineIdx = effectiveSourceWords[bestSourceIdx].lineIdx;
                if (generateLinks) {
                  const targetFileName = targetInfo ? targetInfo.targetName : (baseSourceName.split('/').pop() || baseSourceName);
                  const finalPath = targetFileName.endsWith('.txt') ? targetFileName : targetFileName + '.txt';
                  
                  // Link 1: To the commentary (Rashi/Tosafot)
                  const link1 = {
                    line_index_1: pIdx + 1,
                    line_index_2: matchedLineIdx,
                    heRef_2: effectiveHeader,
                    path_2: finalPath,
                    "Conection Type": "commentary"
                  };
                  fileLinks.push(link1);
                  lastLinkData = { ...link1 };
                  lastMainLinkData = null;

                  // Link 2: To the main source (Gemara) - only if we switched sources
                  if (targetInfo && targetInfo.type !== null) {
                    // Search for the same words in the main source
                    let mainBestIdx = -1;
                    let mainBestScore = -Infinity;
                    
                    for (let j = 0; j < currentSourceWords.length; j++) {
                      let sourceOffset = 0;
                      let matched = 0;
                      for (let k = 0; k < searchWords.length; k++) {
                        const m = checkMatch(searchWords[k], currentSourceWords.slice(j + sourceOffset));
                        if (m.consumedSource > 0) {
                          matched++;
                          sourceOffset += m.consumedSource;
                        } else break;
                      }
                      if (matched > 0) {
                        let score = matched - (Math.abs(j - lastMatchIndex) * 0.005);
                        if (score > mainBestScore) {
                          mainBestScore = score;
                          mainBestIdx = j;
                        }
                      }
                    }

                    if (mainBestIdx !== -1) {
                      const shortBaseName = baseSourceName.split('/').pop() || baseSourceName;
                      const mainFinalPath = shortBaseName.endsWith('.txt') ? shortBaseName : shortBaseName + '.txt';
                      const link2 = {
                        line_index_1: pIdx + 1,
                        line_index_2: currentSourceWords[mainBestIdx].lineIdx,
                        heRef_2: currentSourceSection.fullHeader,
                        path_2: mainFinalPath,
                        "Conection Type": "commentary"
                      };
                      fileLinks.push(link2);
                      lastMainLinkData = { ...link2 };
                      lastMatchIndex = mainBestIdx + 1; // Update lastMatchIndex based on main source
                    }
                  } else {
                    lastMatchIndex = bestSourceIdx + bestConsumedSource;
                  }
                } else {
                   if (!targetInfo) lastMatchIndex = bestSourceIdx + bestConsumedSource;
                }
              }

              let currentWordIdx = -1;
              let inWord = false;
              let finalEndPos = 0;
              let inTag = false;

              for (let i = 0; i < p.length; i++) {
                if (p[i] === '<') inTag = true;
                if (!inTag) {
                  const isWhitespace = /\s/.test(p[i]);
                  if (!isWhitespace && !inWord) {
                    inWord = true;
                    currentWordIdx++;
                  } else if (isWhitespace && inWord) {
                    inWord = false;
                  }
                }
                if (currentWordIdx < totalHighlightWords) finalEndPos = i + 1;
                else break;
                if (p[i] === '>') inTag = false;
              }
              while (finalEndPos < p.length && /[.:\-]/.test(p[finalEndPos])) finalEndPos++;
              
              const dhmPart = p.substring(0, finalEndPos).replace(/<\/?b>/gi, '');
              const restPart = p.substring(finalEndPos);
              return `<b>${dhmPart}</b>${restPart}`;
            }
            return p;
          }).join('\n');
          nextFiles.push({ ...f, content: newContent, links: generateLinks ? fileLinks : undefined });
        }

        setLoadedFiles(nextFiles);
        setIsModalOpen(false);
        setIsProcessing(false);
        setProcessingProgress(0);
      }
    }, 100);
  };

  const processHeaderGroup = async (headerIdx: number, groups: Record<string, { fileIdx: number, pIdx: number, text: string }[]>, headers: string[], sections: { header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[]) => {
    const header = headers[headerIdx];
    const paragraphs = groups[header];
    const section = sections.find(s => s.header === header) || sections[0];
    
    const batchItems: ReviewItem[] = [];
    const fileLastMatchIndices: Record<number, number> = {};
    const fileLastCommentaryTypes: Record<number, 'tosafot' | 'rashi' | null> = {};
    const fileLastLinkData: Record<number, { sourceLineIndex: number; fullHeader: string; mainSourceLineIndex?: number; mainSourceHeader?: string; targetName: string }> = {};
    const baseSourceName = selectedSource.replace(/\.[^/.]+$/, "");
    const sectionsCache: Record<string, any[]> = { [selectedSource]: sections };

    // Update last commentary type from header
    const fileIndices = new Set(paragraphs.map(p => p.fileIdx));
    if (header.includes('תוס') || header.includes('תוד')) {
      fileIndices.forEach(fIdx => {
        fileLastCommentaryTypes[fIdx] = 'tosafot';
      });
    } else if (header.includes('רש')) {
      fileIndices.forEach(fIdx => {
        fileLastCommentaryTypes[fIdx] = 'rashi';
      });
    }

    for (let i = 0; i < paragraphs.length; i++) {
      const item = paragraphs[i];
      const p = item.text;
      const cleanP = p.replace(/<[^>]*>/g, '');
      const originalWords = cleanP.split(/\s+/);
      
      const lastType = fileLastCommentaryTypes[item.fileIdx] || null;
      const targetInfo = getTargetSections(cleanP, baseSourceName, header, sectionsCache, lastType);
      
      if (targetInfo?.isSameAsPrevious && fileLastLinkData[item.fileIdx]) {
        const lastData = fileLastLinkData[item.fileIdx];
        batchItems.push({
          fileIdx: item.fileIdx,
          paragraphIdx: item.pIdx,
          originalText: p,
          sourceText: "(באותו דיבור)",
          sourceContext: "",
          explodedWordCount: 1,
          wordMap: [0],
          originalWords,
          headerText: header,
          fullHeader: lastData.fullHeader,
          sourceLineIndex: lastData.sourceLineIndex,
          mainSourceLineIndex: lastData.mainSourceLineIndex,
          mainSourceHeader: lastData.mainSourceHeader,
          targetName: lastData.targetName
        });
        continue;
      }

      let effectiveSourceWords = section.words;
      let effectiveHeader = section.fullHeader;
      let prefixWordCount = 0;

      if (targetInfo) {
        fileLastCommentaryTypes[item.fileIdx] = targetInfo.type;
        prefixWordCount = targetInfo.prefix.split(/\s+/).length;
        if (targetInfo.matchingSection) {
          effectiveSourceWords = targetInfo.matchingSection.words;
          effectiveHeader = targetInfo.matchingSection.fullHeader;
        }
      }

      const searchWords = targetInfo ? originalWords.slice(prefixWordCount) : originalWords;
      const lastIdx = targetInfo ? 0 : (fileLastMatchIndices[item.fileIdx] || 0);
      let candidates: { index: number, matchCount: number, consumedSource: number }[] = [];

      for (let j = 0; j < effectiveSourceWords.length; j++) {
        let sourceOffset = 0;
        let matchedOriginalWords = 0;
        
        for (let k = 0; k < searchWords.length; k++) {
          const pWord = searchWords[k];
          const remainingSource = effectiveSourceWords.slice(j + sourceOffset);
          
          const match = checkMatch(pWord, remainingSource);
          if (match.consumedSource > 0) {
            matchedOriginalWords++;
            sourceOffset += match.consumedSource;
          } else {
            break;
          }
        }
        
        if (matchedOriginalWords > 0) {
          candidates.push({ 
            index: j, 
            matchCount: matchedOriginalWords, 
            consumedSource: sourceOffset 
          });
        }
      }

      let bestSourceIdx = -1;
      let maxMatchCount = 0;
      let bestScore = -Infinity;
      let bestConsumedSource = 0;

      candidates.forEach(candidate => {
         let score = candidate.matchCount;
         if (candidate.matchCount === 1) {
            const match = checkMatch(searchWords[0], effectiveSourceWords.slice(candidate.index));
            if (match.consumedSource === 1) {
              const pWordNorm = normalize(searchWords[0].replace(/["']/g, ''));
              const sWordNorm = normalize(effectiveSourceWords[candidate.index].text.replace(/["']/g, ''));
              if (fuzz.ratio(pWordNorm, sWordNorm) < 92) {
                score = -Infinity;
              }
            }
         }

         if (score !== -Infinity) {
             const distance = candidate.index - lastIdx;
             if (distance >= 0) {
                 score -= (distance * 0.005);
             } else {
                 score -= 5;
             }

             if (score > bestScore) {
                 bestScore = score;
                 bestSourceIdx = candidate.index;
                 maxMatchCount = candidate.matchCount;
                 bestConsumedSource = candidate.consumedSource;
             }
         }
      });

      if (maxMatchCount >= 1 || targetInfo) {
        let finalMatchCount = maxMatchCount;
        if (maxMatchCount >= 1) {
          if (maxMatchCount < searchWords.length) {
            const nextWord = searchWords[maxMatchCount].replace(/[.,:;?!]/g, '');
            if (nextWord === "כו'" || nextWord === "וכו'") {
              finalMatchCount++;
            }
          }
        } else if (targetInfo) {
          finalMatchCount = 1;
        }

        let mainSourceLineIndex = 0;
        let mainSourceHeader = "";

        if (maxMatchCount >= 1) {
          if (targetInfo && targetInfo.type !== null) {
            // Search in main source too
            let mainBestIdx = -1;
            let mainBestScore = -Infinity;
            const lastIdxMain = fileLastMatchIndices[item.fileIdx] || 0;

            for (let j = 0; j < section.words.length; j++) {
              let sourceOffset = 0;
              let matched = 0;
              for (let k = 0; k < searchWords.length; k++) {
                const m = checkMatch(searchWords[k], section.words.slice(j + sourceOffset));
                if (m.consumedSource > 0) {
                  matched++;
                  sourceOffset += m.consumedSource;
                } else break;
              }
              if (matched > 0) {
                let score = matched - (Math.abs(j - lastIdxMain) * 0.005);
                if (score > mainBestScore) {
                  mainBestScore = score;
                  mainBestIdx = j;
                }
              }
            }

            if (mainBestIdx !== -1) {
              mainSourceLineIndex = section.words[mainBestIdx].lineIdx;
              mainSourceHeader = section.fullHeader;
              fileLastMatchIndices[item.fileIdx] = mainBestIdx + 1;
            }
          } else {
            fileLastMatchIndices[item.fileIdx] = bestSourceIdx + bestConsumedSource;
          }
        }

        const matchedSourceText = maxMatchCount >= 1 
          ? effectiveSourceWords.slice(bestSourceIdx, bestSourceIdx + bestConsumedSource).map(w => w.text).join(' ')
          : "(לא נמצאה התאמה מדויקת)";
        const matchedSourceContext = maxMatchCount >= 1
          ? effectiveSourceWords.slice(bestSourceIdx + bestConsumedSource, bestSourceIdx + bestConsumedSource + 5).map(w => w.text).join(' ')
          : "";
        
        batchItems.push({
          fileIdx: item.fileIdx,
          paragraphIdx: item.pIdx,
          originalText: p,
          sourceText: matchedSourceText,
          sourceContext: matchedSourceContext,
          explodedWordCount: prefixWordCount + finalMatchCount,
          wordMap: Array.from({length: prefixWordCount + finalMatchCount}, (_, i) => i),
          originalWords,
          headerText: header,
          fullHeader: effectiveHeader,
          sourceLineIndex: maxMatchCount >= 1 ? effectiveSourceWords[bestSourceIdx].lineIdx : 0,
          mainSourceLineIndex,
          mainSourceHeader,
          targetName: targetInfo ? targetInfo.targetName : baseSourceName
        });

        fileLastLinkData[item.fileIdx] = {
          sourceLineIndex: maxMatchCount >= 1 ? effectiveSourceWords[bestSourceIdx].lineIdx : 0,
          fullHeader: effectiveHeader,
          mainSourceLineIndex,
          mainSourceHeader,
          targetName: targetInfo ? targetInfo.targetName : baseSourceName
        };
      }
    }

    setCurrentReviewBatch(batchItems);
    setActiveTab('review');
    setIsProcessing(false);
    setProcessingProgress(0);
    setIsModalOpen(false);
  };

  const applyReviewBatch = () => {
    pushToHistory();
    const nextFiles = [...loadedFiles];
    
    currentReviewBatch.forEach(item => {
      const f = nextFiles[item.fileIdx];
      const paragraphs = f.content.split('\n');
      const p = item.originalText;
      
      const targetWordCount = item.explodedWordCount;
      let currentWordIdx = -1;
      let inWord = false;
      let finalEndPos = 0;
      let inTag = false;

      for (let i = 0; i < p.length; i++) {
        if (p[i] === '<') inTag = true;
        if (!inTag) {
          const isWhitespace = /\s/.test(p[i]);
          if (!isWhitespace && !inWord) {
            inWord = true;
            currentWordIdx++;
          } else if (isWhitespace && inWord) {
            inWord = false;
          }
        }
        if (currentWordIdx < targetWordCount) finalEndPos = i + 1;
        else break;
        if (p[i] === '>') inTag = false;
      }
      while (finalEndPos < p.length && /[.:\-]/.test(p[finalEndPos])) finalEndPos++;
      
      paragraphs[item.paragraphIdx] = `<b>${p.substring(0, finalEndPos).replace(/<\/?b>/gi, '')}</b>${p.substring(finalEndPos)}`;
      
      if (generateLinks && item.sourceLineIndex && item.sourceLineIndex > 0) {
        if (!nextFiles[item.fileIdx].links) nextFiles[item.fileIdx].links = [];
        const targetFileName = item.targetName || (selectedSource.split('/').pop() || selectedSource).replace(/\.[^/.]+$/, "");
        const finalPath = targetFileName.endsWith('.txt') ? targetFileName : targetFileName + '.txt';
        
        // Link to Commentary
        nextFiles[item.fileIdx].links.push({
          line_index_1: item.paragraphIdx + 1,
          line_index_2: item.sourceLineIndex,
          heRef_2: item.fullHeader || "",
          path_2: finalPath,
          "Conection Type": "commentary"
        });

        // Link to Main Source
        if (item.mainSourceLineIndex && item.mainSourceLineIndex > 0) {
          const shortBaseName = (selectedSource.split('/').pop() || selectedSource).replace(/\.[^/.]+$/, "");
          const mainFinalPath = shortBaseName.endsWith('.txt') ? shortBaseName : shortBaseName + '.txt';
          nextFiles[item.fileIdx].links.push({
            line_index_1: item.paragraphIdx + 1,
            line_index_2: item.mainSourceLineIndex,
            heRef_2: item.mainSourceHeader || "",
            path_2: mainFinalPath,
            "Conection Type": "commentary"
          });
        }
      }

      nextFiles[item.fileIdx] = { ...f, content: paragraphs.join('\n') };
    });

    setLoadedFiles(nextFiles);
    
    const nextIdx = currentHeaderIdx + 1;
    if (nextIdx < reviewHeaders.length) {
      setCurrentHeaderIdx(nextIdx);
      setIsProcessing(true);
      setTimeout(() => {
        processHeaderGroup(nextIdx, reviewGroups, reviewHeaders, sourceSections);
        const scrollContainer = document.getElementById('review-scroll-container');
        if (scrollContainer) scrollContainer.scrollTop = 0;
      }, 100);
    } else {
      setActiveTab('preview');
      setReviewGroups({});
      setReviewHeaders([]);
      setCurrentReviewBatch([]);
    }
  };

  const downloadAll = async () => {
    if (loadedFiles.length === 0) return;
    const zip = new JSZip();
    loadedFiles.forEach(f => {
      zip.file(`${f.name}.txt`, f.content);
      if (f.links && f.links.length > 0) {
        zip.file(`${f.name}_links.json`, JSON.stringify(f.links, null, 2));
      }
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Output_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const previewHeaders = React.useMemo(() => {
    if (!currentFileContent) return [];
    const headers: { tagName: string; textContent: string; startIndex: number; length: number }[] = [];
    const regex = /<(h[1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
    let match;
    while ((match = regex.exec(currentFileContent)) !== null) {
      headers.push({
        tagName: match[1].toUpperCase(),
        textContent: match[2].replace(/<[^>]*>/g, ''),
        startIndex: match.index,
        length: match[0].length
      });
    }
    return headers;
  }, [currentFileContent]);

  const scrollToHeader = useCallback((startIndex: number, length: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(startIndex, startIndex + length);

    setTimeout(() => {
      textarea.setSelectionRange(startIndex, startIndex);
      textarea.blur();
      textarea.focus();
    }, 0);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">
      {isProcessing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md text-white">
          <div className="mb-6">
            <RefreshCw size={64} className="text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">מעבד נתונים...</h2>
          <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
            <div 
              className="h-full bg-blue-400"
              style={{ width: `${processingProgress}%` }}
            />
          </div>
          <div className="text-3xl font-mono font-bold text-blue-400 mb-4">
            {processingProgress}%
          </div>
          <p className="text-slate-300">אנא המתן בזמן שהמערכת מבצעת את ההדגשות</p>
        </div>
      )}

      {/* Inputs are defined here - fixed a bug where fileInputRef was typed as textarea instead of input */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <input 
        ref={folderInputRef} 
        type="file" 
        {...({ webkitdirectory: "", directory: "" } as any)} 
        multiple 
        className="hidden" 
        onChange={(e) => handleFiles(e.target.files)} 
      />

      <aside className={`bg-white border-l border-slate-200 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Highlighter size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">מעבד טקסט מתקדם</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavButton 
            id="highlight_regex" 
            icon={Highlighter} 
            label="הדגשה באמצעות תוי סיום" 
            onClick={() => { setActiveTab('highlight_regex'); setIsModalOpen(true); }} 
          />
          <NavButton 
            id="highlight_fuzzy" 
            icon={ArrowLeftRight} 
            label="הדגשה באמצעות השוואה" 
            onClick={() => { setActiveTab('highlight_fuzzy'); setIsModalOpen(true); }} 
          />
        </nav>

        <div className="p-4 border-t border-slate-100">
           <div className="text-xs text-slate-400 text-center">v4.0 - Highlighting Edition</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
              <FileText size={14} />
              <span>{loadedFiles.length} קבצים</span>
            </div>
          </div>
          
          <div className="flex gap-2">
             <button 
                onClick={undo}
                disabled={history.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-bold border text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-30"
              >
                <Undo2 size={16} />
                בטל
              </button>
             <button 
                onClick={() => (fileInputRef.current as unknown as HTMLInputElement)?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-sm font-bold"
              >
                <FileText size={16} />
                טען קבצים
              </button>
              <button 
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors text-sm font-bold"
              >
                <Folder size={16} />
                טען תיקייה
              </button>
              <button 
                onClick={downloadAll}
                disabled={loadedFiles.length === 0}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors text-sm font-bold disabled:opacity-30"
              >
                <Download size={16} />
                הורד הכל (ZIP)
              </button>
             <button 
                onClick={() => {
                  if (loadedFiles.length === 0) return;
                  pushToHistory();
                  setLoadedFiles([]);
                }}
                className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-bold mr-2"
              >
                <Trash2 size={16} />
                נקה הכל
              </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-4 flex flex-col">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0">
            <div className="flex gap-6 flex-1 min-h-0">
              <aside className="w-64 border border-slate-200 rounded-xl bg-slate-50 overflow-y-auto p-4 flex flex-col gap-1 shrink-0">
                <div className="text-xs font-bold text-slate-400 mb-2 border-b border-slate-200 pb-2">ניווט כותרות</div>
                {previewHeaders.length > 0 ? previewHeaders.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToHeader(h.startIndex, h.length)}
                    className={`text-right text-[11px] p-1.5 border-r-2 transition-colors hover:bg-white flex flex-col items-start w-full ${
                      h.tagName === 'H1' ? 'font-bold border-blue-500 bg-blue-50/50' : 'border-slate-200'
                    }`}
                  >
                    <span className="opacity-50 text-[9px] block mb-0.5">{h.tagName}</span>
                    <span className="line-clamp-2">{h.textContent}</span>
                  </button>
                )) : <div className="text-xs text-slate-400 italic">לא נמצאו כותרות</div>}
              </aside>

              <div className="flex-1 flex flex-col min-h-0 h-full gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1 px-2 border-l border-slate-200 ml-2">
                      {['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].map(h => (
                        <button
                          key={h}
                          onClick={() => insertTag(`<${h.toLowerCase()}>`, `</${h.toLowerCase()}>`)}
                          className="px-2 py-1 text-[10px] font-bold bg-white border border-slate-200 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 px-2 border-l border-slate-200 ml-2">
                      <button onClick={() => insertTag('<b>', '</b>')} className="p-1.5 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors" title="מודגש">
                        <Bold size={14} />
                      </button>
                      <button onClick={() => insertTag('<i>', '</i>')} className="p-1.5 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors" title="נטוי">
                        <Italic size={14} />
                      </button>
                      <button onClick={() => insertTag('<u>', '</u>')} className="p-1.5 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors" title="קו תחתון">
                        <Underline size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">קובץ:</span>
                    <select 
                      value={previewIdx} 
                      onChange={e => setPreviewIdx(Number(e.target.value))}
                      className="p-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[160px]"
                    >
                      {loadedFiles.length === 0 ? (
                        <option>אין קבצים טעונים</option>
                      ) : (
                        loadedFiles.map((f, i) => <option key={i} value={i}>{f.name}</option>)
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex-1 relative min-h-0">
                  <textarea
                    ref={textareaRef}
                    value={loadedFiles[previewIdx]?.content || ''}
                    onChange={(e) => {
                      handleContentChange(e.target.value);
                      updateCursorLine();
                    }}
                    onKeyUp={updateCursorLine}
                    onClick={updateCursorLine}
                    onFocus={updateCursorLine}
                    className="w-full h-full bg-white p-6 rounded-2xl border border-slate-200 font-sans text-lg leading-[1.6] text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 resize-none overflow-auto shadow-inner"
                    dir="rtl"
                    placeholder="אין תוכן להצגה או עריכה"
                  />
                </div>

                {cursorLineIdx !== null && loadedFiles[previewIdx]?.links && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shrink-0">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                        <Globe size={14} className="text-blue-500" />
                        קישורים לשורה {cursorLineIdx + 1}
                      </h4>
                      <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-sm">
                        {loadedFiles[previewIdx].links?.filter(l => l.line_index_1 === cursorLineIdx + 1).length || 0} קישורים נמצאו
                      </span>
                    </div>
                    <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                      {loadedFiles[previewIdx].links
                        ?.filter(link => link.line_index_1 === cursorLineIdx + 1)
                        .map((link, i) => {
                          const cleanPath = link.path_2.replace(/\.[^/.]+$/, "");
                          const baseSourceName = selectedSource.replace(/\.[^/.]+$/, "");
                          const sourceText = sourceCache[cleanPath] || (cleanPath === baseSourceName ? activeSourceContent : null);
                          const linkedLine = sourceText ? sourceText.split('\n')[link.line_index_2 - 1] : null;

                          return (
                            <div key={i} className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs shadow-sm flex flex-col gap-3 hover:border-blue-300 transition-all group hover:shadow-md">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <FileText size={14} className="text-blue-500 shrink-0" />
                                  <span className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors text-[12px] whitespace-nowrap">{link.path_2}</span>
                                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-blue-100 whitespace-nowrap">{link.heRef_2 || 'ללא כותרת'}</span>
                                  <span className="text-slate-400 text-[10px] font-medium whitespace-nowrap">שורה {link.line_index_2}</span>
                                </div>
                              </div>
                              {linkedLine ? (
                                <div className="p-3 bg-slate-50/50 rounded-xl border border-slate-100 text-slate-700 text-[13px] leading-relaxed font-medium shadow-inner overflow-hidden whitespace-pre-wrap">
                                  {linkedLine}
                                </div>
                              ) : (
                                <div className="p-3 text-[11px] text-slate-400 italic bg-slate-50/30 rounded-xl border border-dashed border-slate-200 text-center">
                                  תוכן השורה אינו זמין בתצוגה מקדימה (נסה לטעון את המקור שוב)
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {(!loadedFiles[previewIdx].links || loadedFiles[previewIdx].links.filter(l => l.line_index_1 === cursorLineIdx + 1).length === 0) && (
                        <div className="text-xs text-slate-400 italic py-2">אין קישורים משויכים לשורה זו</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {activeTab === 'review' && (
            <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" dir="rtl">
              <div className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-white/20">
                <header className="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                      <ListCheck size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">אישור ועריכת הדגשות</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        כותרת: <span className="font-bold text-blue-600">{reviewHeaders[currentHeaderIdx] === '_initial_' ? 'תחילת הקובץ' : reviewHeaders[currentHeaderIdx]}</span>
                        {' '}({currentHeaderIdx + 1} מתוך {reviewHeaders.length})
                      </p>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-300 ease-out"
                          style={{ width: `${((currentHeaderIdx + 1) / reviewHeaders.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => { setActiveTab('preview'); setReviewQueue([]); }}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </header>

                <div id="review-scroll-container" className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
                  {currentReviewBatch.map((item, idx) => {
                    const targetWordCount = item.explodedWordCount;
                    const boldPart = item.originalWords.slice(0, targetWordCount).join(' ');
                    const restPart = item.originalWords.slice(targetWordCount).join(' ');

                    return (
                      <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-50 border-b border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider">מקור + 5 מילים</div>
                          <div className="text-sm text-slate-700 leading-relaxed">
                            <span className="font-bold text-blue-600">{item.sourceText}</span>
                            <span className="opacity-50"> {item.sourceContext}</span>
                          </div>
                        </div>
                        <div className="p-6">
                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">טקסט להדגשה</div>
                          <div className="text-lg leading-relaxed text-slate-800">
                            <span className="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded-md">{boldPart}</span>
                            <span className="text-slate-400"> {restPart}</span>
                          </div>
                        </div>
                        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-center gap-8">
                          <button 
                            onClick={() => {
                              const newBatch = [...currentReviewBatch];
                              if (newBatch[idx].explodedWordCount > 0) {
                                newBatch[idx] = {
                                  ...newBatch[idx],
                                  explodedWordCount: newBatch[idx].explodedWordCount - 1
                                };
                                setCurrentReviewBatch(newBatch);
                              }
                            }}
                            className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm active:scale-95"
                            title="הסר מילה"
                          >
                            <Minus size={24} />
                          </button>
                          <div className="flex flex-col items-center min-w-[80px]">
                            <span className="text-2xl font-black text-slate-700 leading-none">{item.explodedWordCount}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">מילים מודגשות</span>
                          </div>
                          <button 
                            onClick={() => {
                              const newBatch = [...currentReviewBatch];
                              if (newBatch[idx].explodedWordCount < item.originalWords.length) {                                newBatch[idx] = {
                                  ...newBatch[idx],
                                  explodedWordCount: newBatch[idx].explodedWordCount + 1
                                };
                                setCurrentReviewBatch(newBatch);
                              }
                            }}
                            className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all shadow-sm active:scale-95"
                            title="הוסף מילה"
                          >
                            <Plus size={24} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <footer className="bg-white border-t border-slate-100 p-6 flex justify-center shrink-0">
                  <button 
                    onClick={applyReviewBatch}
                    className="flex items-center gap-3 px-16 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all active:translate-y-0"
                  >
                    <CheckCircle size={24} />
                    אשר והמשך לכותרת הבאה
                  </button>
                </footer>
              </div>
            </div>
          )}

          <Modal 
            isOpen={isModalOpen && activeTab === 'highlight_regex'} 
            onClose={() => setIsModalOpen(false)} 
            title="הדגשה באמצעות תוי סיום" 
            icon={Highlighter}
          >
            <div className="space-y-6">
              <p className="text-slate-600">פעולה זו תסרוק את כל הקבצים הטעונים ותדגיש (תגית b) את תחילת הפסקה עד לתו הסיום הראשון שתבחר.</p>
              
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 block">תווי סיום להדגשה (למשל: . או : או .:-)</label>
                <input 
                  type="text" 
                  value={terminatorChar} 
                  onChange={(e) => setTerminatorChar(e.target.value)}
                  placeholder="הזן תווי סיום..."
                  className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              <button 
                onClick={processWithRegex} 
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
              >
                בצע הדגשה
              </button>
            </div>
          </Modal>

          <Modal 
            isOpen={isModalOpen && activeTab === 'highlight_fuzzy'} 
            onClose={() => setIsModalOpen(false)} 
            title="הדגשה באמצעות השוואה" 
            icon={ArrowLeftRight}
          >
            <div className="space-y-6">
              <p className="text-slate-600">פעולה זו תסרוק את כל הקבצים הטעונים ותדגיש את תחילת הפסקה על ידי השוואה למקור נבחר.</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700">בחר קטגוריה:</label>
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.keys(categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700">בחר מקור להשוואה:</label>
                  <label className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded cursor-pointer hover:bg-blue-100 transition-colors">
                    העלה קובץ מקור (TXT)
                    <input type="file" accept=".txt" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          setLocalSource(content);
                          setSelectedSource(file.name);
                          const cleanName = file.name.replace(/\.txt$/, '');
                          setSourceCache(prev => ({ ...prev, [cleanName]: content }));
                        };
                        reader.readAsText(file);
                      }
                    }} className="hidden" />
                  </label>
                </div>
                <select
                  value={selectedSource}
                  onChange={(e) => {
                    setSelectedSource(e.target.value);
                    setLocalSource('');
                  }}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                  {localSource && <option value={selectedSource}>{selectedSource} (מקומי)</option>}
                </select>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 max-h-32 overflow-y-auto text-xs opacity-60 italic">
                  {activeSourceContent || 'בחר מקור כדי לראות תצוגה מקדימה...'}
                </div>

                <div className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                  <input 
                    type="checkbox" 
                    id="generate-links"
                    checked={generateLinks}
                    onChange={(e) => setGenerateLinks(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="generate-links" className="text-sm font-bold text-slate-700 cursor-pointer">
                    צור קובץ קישורים (_links.json)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => processWithFuzzy('auto')} 
                  className="py-4 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  הדגשה אוטומטית
                </button>
                <button 
                  onClick={() => processWithFuzzy('review')} 
                  className="py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg"
                >
                  אשר והדגש
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </main>
    </div>
  );
};

export default App;