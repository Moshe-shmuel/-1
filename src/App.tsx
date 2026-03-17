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
import { db, auth } from './firebase';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  doc, 
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { ProcessedFile, TabId, LogEntry, ReviewItem } from './types';
import { tauriAPI } from './db';

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [terminatorChar, setTerminatorChar] = useState('.:-');
  const [generateLinks, setGenerateLinks] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('');
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const isDesktop = !!(window as any).__TAURI_INTERNALS__;

  useEffect(() => {
    if (isDesktop) {
      // Load categories from SQLite
      tauriAPI.query({ table: 'categories' }).then((data: any) => {
        setCategories(data);
      });
    } else {
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
          // Fetch categories
          getDocs(collection(db, 'categories')).then(snap => {
            setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          });
        }
      });
      return () => unsubscribe();
    }
  }, [isDesktop]);

  useEffect(() => {
    if (selectedCategoryId) {
      if (isDesktop) {
        tauriAPI.query({ table: 'subcategories', where: { categoryId: selectedCategoryId } }).then((data: any) => {
          setSubcategories(data);
        });
      } else {
        const q = query(collection(db, 'subcategories'), where('categoryId', '==', selectedCategoryId));
        getDocs(q).then(snap => {
          setSubcategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
      }
    } else {
      setSubcategories([]);
    }
  }, [selectedCategoryId, isDesktop]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      addLog("התחברת בהצלחה", "success");
    } catch (err) {
      addLog("שגיאה בהתחברות", "error");
    }
  };

  const handleLogout = () => signOut(auth);

  const seedDatabase = async () => {
    if (!isDesktop && !user) return;
    setIsProcessing(true);
    addLog("מתחיל אתחול מסד נתונים...", "info");
    
    try {
      const cats = ["תנך", "תלמוד בבלי", "רמבם", "שולחן ערוך", "מקורות"];
      const catIds: Record<string, string> = {};
      
      for (const name of cats) {
        const id = Math.random().toString(36).substring(7);
        catIds[name] = id;
        if (isDesktop) {
          await tauriAPI.insert({ table: 'categories', data: { id, name, order: 0 } });
        } else {
          await addDoc(collection(db, 'categories'), { name, order: 0 });
        }
      }

      // Create a subcategory for sources
      const subId = Math.random().toString(36).substring(7);
      if (isDesktop) {
        await tauriAPI.insert({ table: 'subcategories', data: { id: subId, name: "קבצי מקור", categoryId: catIds["מקורות"] } });
      } else {
        await addDoc(collection(db, 'subcategories'), { name: "קבצי מקור", categoryId: catIds["מקורות"] });
      }

      // Fetch files from /api/sources and add them to the DB
      const res = await fetch('/api/sources');
      const files = await res.json();
      
      if (Array.isArray(files)) {
        for (const filename of files) {
          const contentRes = await fetch(`/api/sources/${filename}`);
          const content = await contentRes.text();
          const fileId = Math.random().toString(36).substring(7);
          const name = filename.replace(/\.[^/.]+$/, "");
          
          if (isDesktop) {
            await tauriAPI.insert({ 
              table: 'files', 
              data: { id: fileId, name, content, subcategoryId: subId, isMain: 1 } 
            });
          } else {
            await addDoc(collection(db, 'files'), {
              name,
              content,
              subcategoryId: subId,
              isMain: true
            });
          }
          addLog(`הוסף קובץ: ${name}`, "info");
        }
      }

      addLog("מסד הנתונים אותחל בהצלחה עם קבצי המקור", "success");
      
      // Refresh
      if (isDesktop) {
        const data = await tauriAPI.query({ table: 'categories' });
        setCategories(data);
      } else {
        const snap = await getDocs(collection(db, 'categories'));
        setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (err) {
      addLog("שגיאה באתחול מסד הנתונים", "error");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSubcategory = async () => {
    if (!selectedSubcategoryId) return;
    setIsProcessing(true);
    addLog("טוען קבצים ממסד הנתונים...", "info");
    
    try {
      let files: any[] = [];
      if (isDesktop) {
        files = await tauriAPI.query({ table: 'files', where: { subcategoryId: selectedSubcategoryId } });
      } else {
        const q = query(collection(db, 'files'), where('subcategoryId', '==', selectedSubcategoryId));
        const snap = await getDocs(q);
        files = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      }
      
      if (files.length === 0) {
        addLog("לא נמצאו קבצים בתיקייה זו", "error");
        setIsProcessing(false);
        return;
      }

      // Find shortest name as main source
      let shortest = files[0];
      files.forEach(f => {
        if (f.name.length < shortest.name.length) {
          shortest = f;
        }
      });

      setSelectedSource(shortest.name);
      setSourceContent(shortest.content);
      setLocalSource('');

      const commentaries = files.filter(f => f.id !== shortest.id).map(f => ({
        name: f.name,
        content: f.content,
        originalName: f.name + ".txt"
      }));

      setLoadedFiles(commentaries);
      addLog(`נטענו ${files.length} קבצים. המקור הראשי זוהה כ: ${shortest.name}`, "success");
      setIsDbModalOpen(false);
    } catch (err) {
      addLog("שגיאה בטעינת קבצים", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const handleUploadToDb = async () => {
    if (!selectedSubcategoryId || loadedFiles.length === 0 || (!isDesktop && !user)) return;
    setIsUploading(true);
    addLog(`מעלה ${loadedFiles.length} קבצים ל-DB...`, "info");
    try {
      for (const f of loadedFiles) {
        const id = Math.random().toString(36).substring(7);
        if (isDesktop) {
          await tauriAPI.insert({ 
            table: 'files', 
            data: { id, name: f.name, content: f.content, subcategoryId: selectedSubcategoryId, isMain: 0 } 
          });
        } else {
          await addDoc(collection(db, 'files'), {
            name: f.name,
            content: f.content,
            subcategoryId: selectedSubcategoryId,
            isMain: false
          });
        }
      }
      // Also upload main source if it's local
      if (localSource) {
        const id = Math.random().toString(36).substring(7);
        if (isDesktop) {
          await tauriAPI.insert({ 
            table: 'files', 
            data: { id, name: selectedSource.replace(/\.[^/.]+$/, ""), content: localSource, subcategoryId: selectedSubcategoryId, isMain: 1 } 
          });
        } else {
          await addDoc(collection(db, 'files'), {
            name: selectedSource.replace(/\.[^/.]+$/, ""),
            content: localSource,
            subcategoryId: selectedSubcategoryId,
            isMain: true
          });
        }
      }
      addLog("העלאה הושלמה בהצלחה", "success");
    } catch (err) {
      addLog("שגיאה בהעלאה ל-DB", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const createSubcategory = async (name: string) => {
    if (!selectedCategoryId || !name) return;
    const id = Math.random().toString(36).substring(7);
    if (isDesktop) {
      await tauriAPI.insert({ table: 'subcategories', data: { id, name, categoryId: selectedCategoryId } });
      const data = await tauriAPI.query({ table: 'subcategories', where: { categoryId: selectedCategoryId } });
      setSubcategories(data);
    } else {
      await addDoc(collection(db, 'subcategories'), {
        name,
        categoryId: selectedCategoryId
      });
      // Refresh
      const q = query(collection(db, 'subcategories'), where('categoryId', '==', selectedCategoryId));
      const snap = await getDocs(q);
      setSubcategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  };
  
  // Review States
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [currentReviewBatch, setCurrentReviewBatch] = useState<ReviewItem[]>([]);
  const [reviewHeaders, setReviewHeaders] = useState<string[]>([]);
  const [currentHeaderIdx, setCurrentHeaderIdx] = useState(0);
  const [reviewGroups, setReviewGroups] = useState<Record<string, { fileIdx: number, pIdx: number, text: string }[]>>({});
  const [sourceSections, setSourceSections] = useState<{ header: string, fullHeader: string, words: { text: string, lineIdx: number }[] }[]>([]);

  // Highlighting States
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [sourceCache, setSourceCache] = useState<Record<string, string>>({});
  const [sourceContent, setSourceContent] = useState<string>('');
  const [localSource, setLocalSource] = useState<string>('');

  const activeSourceContent = localSource || sourceContent;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/sources')
      .then(res => res.json())
      .then(data => {
        const remoteSources = Array.isArray(data) ? data : [];
        setSources(prev => Array.from(new Set([...prev, ...remoteSources])));
      })
      .catch(err => {
        console.log('Standalone mode or API unavailable');
      });
  }, []);

  useEffect(() => {
    if (selectedSource && !localSource) {
      if (sourceCache[selectedSource]) {
        setSourceContent(sourceCache[selectedSource]);
      } else {
        fetch(`/api/sources/${selectedSource}`)
          .then(res => res.text())
          .then(data => {
            setSourceContent(data);
            setSourceCache(prev => ({ ...prev, [selectedSource]: data }));
          })
          .catch(err => console.error('Error fetching source:', err));
      }
    }
  }, [selectedSource, localSource, sourceCache]);

  const currentFileContent = loadedFiles[previewIdx]?.content;

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      if (prev.length > 0 && isEqual(prev[0], loadedFiles)) {
        return prev;
      }
      return [loadedFiles, ...prev].slice(0, 20);
    });
  }, [loadedFiles]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }, ...prev].slice(0, 50));
  };

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
    addLog(`נטענו ${files.length} קבצים`, 'success');
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
    const prefixMatch = p.match(/^(תוס' ד"ה|תוד"ה|תוספות|רשד"ה|רש"י ד"ה|רש"י|פירש"י\s+ב?ד"ה|פרש"י\s+ב?ד"ה|ו?ב?תוספות\s+ב?ד"ה|ו?ב?תוס'\s+ב?ד"ה|שם\s+ב?ד"ה|ב?ד"ה|ד"ה|בא"ד|באו"ד)\s+/);
    if (!prefixMatch) return null;
    
    const prefix = prefixMatch[1];
    if (prefix === 'בא"ד' || prefix === 'באו"ד') {
      return { isSameAsPrevious: true, prefix, type: lastType, sections: null, matchingSection: null };
    }

    let targetName = "";
    let currentType: 'tosafot' | 'rashi' | null = null;

    if (prefix.includes('תוס') || prefix.includes('תוד')) {
      currentType = 'tosafot';
    } else if (prefix.includes('רש')) {
      currentType = 'rashi';
    } else {
      // Generic prefix (ד"ה, שם בד"ה etc.) - inherit from last known type
      currentType = lastType;
    }

    const shortBaseName = baseSourceName.split('/').pop() || baseSourceName;
    const shortTargetName = currentType === 'tosafot' ? `תוספות על ${shortBaseName}` : `רשי על ${shortBaseName}`;
    const fullTargetName = currentType === 'tosafot' ? `תוספות על ${baseSourceName}` : `רשי על ${baseSourceName}`;

    if (!currentType) return { sections: null, prefix, matchingSection: null, type: currentType, targetName: shortBaseName };
    
    if (sectionsCache[fullTargetName]) {
      const matchingSection = sectionsCache[fullTargetName].find((s: any) => s.header === currentHeader);
      return { sections: sectionsCache[fullTargetName], prefix, matchingSection, type: currentType, targetName: shortTargetName };
    }
    
    const content = sourceCache[fullTargetName] || sourceCache[fullTargetName + ".txt"];
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
    addLog("פעולה אחרונה בוטלה", 'info');
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
          const match = p.match(regex);
          if (match) {
            const dhm = match[1];
            const rest = p.substring(dhm.length);
            return `<b>${dhm}</b>${rest}`;
          }
          return p;
        }).join('\n');
        nextFiles.push({ ...f, content: newContent });
      }

      setLoadedFiles(nextFiles);
      addLog("הדגשה באמצעות תוי סיום הושלמה", 'success');
      setIsModalOpen(false);
      setIsProcessing(false);
      setProcessingProgress(0);
    }, 100);
  };

  const processWithFuzzy = (mode: 'auto' | 'review' = 'auto') => {
    if (!activeSourceContent) {
      addLog("יש לבחור מקור להשוואה", 'error');
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
          addLog("לא נמצאו פסקאות להדגשה", 'info');
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
              
              const finalEndPos = originalWords.slice(0, prefixWordCount).join(' ').length;
              return `<b>${trimmed.substring(0, finalEndPos)}</b>${trimmed.substring(finalEndPos)}`;
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
                  if (targetInfo) {
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
              return `<b>${p.substring(0, finalEndPos)}</b>${p.substring(finalEndPos)}`;
            }
            return p;
          }).join('\n');
          nextFiles.push({ ...f, content: newContent, links: generateLinks ? fileLinks : undefined });
        }

        setLoadedFiles(nextFiles);
        addLog("הדגשה חכמה הושלמה", 'success');
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
          if (targetInfo) {
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
      
      paragraphs[item.paragraphIdx] = `<b>${p.substring(0, finalEndPos)}</b>${p.substring(finalEndPos)}`;
      
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
      addLog("תהליך אישור ההדגשות הושלם", 'success');
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
          <button
            onClick={() => setIsDbModalOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-right text-slate-600 hover:bg-blue-50 hover:text-blue-600"
          >
            <Globe size={18} />
            <span className="font-semibold text-sm">בחירת קבצים מה-DB</span>
          </button>
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
             {user ? (
               <div className="flex items-center gap-2 ml-4">
                 <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                 <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-red-600">התנתק</button>
               </div>
             ) : (
               <button onClick={handleLogin} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors text-sm font-bold ml-4">
                 התחבר עם Google
               </button>
             )}
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
                onClick={() => {
                  if (loadedFiles.length === 0) return;
                  pushToHistory();
                  setLoadedFiles([]);
                  addLog("כל הקבצים נוקו", "info");
                }}
                className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-bold mr-2"
              >
                <Trash2 size={16} />
                נקה הכל
              </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-8 pb-32 flex flex-col">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Eye className="text-blue-500" /> עורך טקסט
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-xs font-bold text-slate-500">שם קובץ:</span>
                  <input 
                    type="text"
                    value={loadedFiles[previewIdx]?.name || ''}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 w-48"
                  />
                </div>
                <select 
                  value={previewIdx} 
                  onChange={e => setPreviewIdx(Number(e.target.value))}
                  className="p-3 border border-slate-200 rounded-xl text-sm min-w-[200px] outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {loadedFiles.length === 0 ? (
                    <option>אין קבצים טעונים</option>
                  ) : (
                    loadedFiles.map((f, i) => <option key={i} value={i}>{f.name}</option>)
                  )}
                </select>
              </div>
            </div>

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
                <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
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

                <div className="flex-1 relative min-h-0">
                  <textarea
                    ref={textareaRef}
                    value={loadedFiles[previewIdx]?.content || ''}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="w-full h-full bg-white p-8 rounded-2xl border border-slate-200 font-sans text-lg leading-[1.6] text-slate-800 outline-none focus:ring-2 focus:ring-blue-400 resize-none overflow-auto shadow-inner"
                    dir="rtl"
                    placeholder="אין תוכן להצגה או עריכה"
                  />
                </div>
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
                  <label className="text-sm font-bold text-slate-700">בחר מקור להשוואה:</label>
                  <label className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded cursor-pointer hover:bg-blue-100 transition-colors">
                    העלה קובץ מקור (TXT)
                    <input type="file" accept=".txt" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setLocalSource(event.target?.result as string);
                          setSelectedSource(file.name);
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

          <Modal
            isOpen={isDbModalOpen}
            onClose={() => setIsDbModalOpen(false)}
            title="בחירת קבצים ממסד הנתונים"
            icon={Globe}
          >
            <div className="space-y-6">
              {(!isDesktop && !user) ? (
                <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-600 mb-4">יש להתחבר כדי לגשת למסד הנתונים</p>
                  <button onClick={handleLogin} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold">התחבר</button>
                </div>
              ) : (
                <>
                  {isDesktop && (
                    <div className="p-3 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-2">
                      <CheckCircle size={14} />
                      מצב אופליין (Electron) פעיל - משתמש ב-SQLite מקומי
                    </div>
                  )}
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-bold text-slate-700 block mb-2">סוג פרשנות (תיקייה ראשית)</label>
                      <select 
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">בחר קטגוריה...</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

                    {selectedCategoryId && (
                      <div>
                        <label className="text-sm font-bold text-slate-700 block mb-2">פרשנות על... (תיקיית משנה)</label>
                        <select 
                          value={selectedSubcategoryId}
                          onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">בחר תיקיית משנה...</option>
                          {subcategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={handleLoadSubcategory}
                      disabled={!selectedSubcategoryId}
                      className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg disabled:bg-slate-300"
                    >
                      טען והשווה (זיהוי מקור אוטומטי)
                    </button>
                  </div>

                  {loadedFiles.length > 0 && selectedSubcategoryId && (
                    <div className="p-4 bg-green-50 border border-green-100 rounded-xl flex items-center justify-between">
                      <span className="text-xs text-green-700 font-bold">ישנם {loadedFiles.length} קבצים טעונים שניתן לשמור בתיקייה זו</span>
                      <button 
                        onClick={handleUploadToDb}
                        disabled={isUploading}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:bg-slate-300"
                      >
                        {isUploading ? 'מעלה...' : 'שמור קבצים ב-DB'}
                      </button>
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    {selectedCategoryId && (
                      <button 
                        onClick={() => {
                          const name = prompt("שם תיקיית המשנה החדשה:");
                          if (name) createSubcategory(name);
                        }}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Plus size={12} /> הוסף תיקיית משנה
                      </button>
                    )}
                    {categories.length === 0 && (
                      <button onClick={seedDatabase} className="text-xs text-blue-600 hover:underline">אתחל מסד נתונים (קטגוריות ברירת מחדל)</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Modal>
        </div>

        <footer className="bg-white border-t border-slate-200 px-8 py-6 flex items-center gap-8 fixed bottom-0 left-0 right-0 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]" style={{ right: isSidebarOpen ? '288px' : '0' }}>
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 h-20 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-slate-400 text-xs mt-2 italic">ממתין לפעולות...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`text-xs mb-1 flex items-center gap-2 ${
                  log.type === 'success' ? 'text-green-600' : 
                  log.type === 'error' ? 'text-red-600' : 'text-slate-500'
                }`}>
                  <span className="font-mono text-[10px] opacity-60">[{log.timestamp}]</span>
                  <span className="font-medium">{log.message}</span>
                </div>
              ))
            )}
          </div>
          
          <button 
            disabled={loadedFiles.length === 0}
            onClick={downloadAll}
            className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-white transition-all shadow-xl shadow-blue-200 ${
              loadedFiles.length === 0 ? 'bg-slate-300' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 active:scale-95'
            }`}
          >
            <Download size={22} />
            הורד הכל ב-ZIP
          </button>
        </footer>
      </main>
    </div>
  );
};

export default App;