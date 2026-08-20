import { useState, useEffect } from 'react';
import type { ThemeMode, PublicQueueState, PostResult, ScannerState, StoredResults, ApiResponse, ExtensionMessage, ScanConfig, ExportFormat } from '../types';

export function useScanner() {
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [queue, setQueue] = useState<PublicQueueState | null>(null);
  const [results, setResults] = useState<PostResult[]>([]);
  const [scannerState, setScannerState] = useState<ScannerState | null>(null);

  const [queueUrls, setQueueUrls] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState(100);
  const [minComments, setMinComments] = useState(15);
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal');

  useEffect(() => {
    chrome.storage.local.get('finderTheme').then((stored) => {
      const storedTheme = stored['finderTheme'];
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setTheme(storedTheme);
      } else {
        setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      }
    });

    loadState();
    refreshQueue();

    const timer = setInterval(() => {
      loadState();
      refreshQueue();
    }, 1800);

    const messageListener = (message: ExtensionMessage) => {
      if ('type' in message) {
        if (message.type === 'stateUpdate') {
          setScannerState(message.state);
          if (message.state.results) setResults(message.state.results);
        }
        if (message.type === 'queueStatus') setQueue(message.queue);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      clearInterval(timer);
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    chrome.storage.local.set({ finderTheme: newTheme });
  };

  const loadState = async () => {
    try {
      const stored = await chrome.storage.local.get(['commentFinder', 'commentFinderResults']);
      const state = stored['commentFinder'] as ScannerState | undefined;
      const persisted = stored['commentFinderResults'] as StoredResults | undefined;

      if (state) {
        setScannerState(state);
        if (!state.running && persisted?.results) {
          setResults(persisted.results);
        } else if (state.results) {
          setResults(state.results);
        }
      } else if (persisted?.results) {
        setResults(persisted.results);
      }
    } catch {}
  };

  const refreshQueue = async () => {
    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ApiResponse>({ action: 'queueStatus' });
      if (response?.queue) setQueue(response.queue);
    } catch {}
  };

  const isFacebookUrl = (value: unknown) => {
    try {
      const url = new URL(String(value).trim());
      return /^https?:$/.test(url.protocol) && /(?:^|\.)facebook\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  };

  const getValidUrls = () => {
    return [...new Set(queueUrls.split(/\r?\n/).map((v) => v.trim()).filter(isFacebookUrl))];
  };

  const handleStartQueue = async () => {
    const urls = getValidUrls();
    if (!urls.length) return;

    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ApiResponse>({
        action: 'startQueue',
        urls,
        config: { limit, minimumComments: minComments, speed },
      });
      if (response?.queue) setQueue(response.queue);
    } catch (e) {}
  };

  const sendQueueAction = async (action: 'pauseQueue' | 'stopQueue' | 'clearQueue') => {
    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ApiResponse>({ action });
      if (response?.queue) setQueue(response.queue);
      if (action === 'clearQueue' && response?.success) {
        setQueue(null);
        setResults([]);
        setScannerState(null);
      }
    } catch {}
  };

  const exportResults = (format: ExportFormat) => {
    if (!results.length) return;

    let mimeType = 'text/plain;charset=utf-8';
    let fileContent = '';
    let fileName = `FB-Comments-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      mimeType = 'text/csv;charset=utf-8';
      fileName += '.csv';
      const rows = [['ইনডেক্স', 'ইউআরএল', 'কমেন্ট', 'শেয়ার', 'লাইক', 'স্নিপেট', 'টাইমস্ট্যাম্প']];
      results.forEach((r, i) => {
        rows.push([
          String(i + 1),
          r.url || '',
          String(r.comments || 0),
          String(r.shares || 0),
          String(r.likes || 0),
          `"${String(r.text || '').replace(/"/g, '""').replace(/\\r?\n/g, ' ')}"`,
          r.timestamp || '',
        ]);
      });
      fileContent = '\uFEFF' + rows.map((row) => row.join(',')).join('\r\n');
    } else if (format === 'json') {
      mimeType = 'application/json;charset=utf-8';
      fileName += '.json';
      fileContent = JSON.stringify(results, null, 2);
    } else {
      fileName += '.txt';
      const lines = [
        'ফেসবুক কমেন্ট ফাইন্ডার — স্ক্যান করা ফলাফল',
        '========================================',
        `এক্সপোর্টের সময়: ${new Date().toISOString()}`,
        `মোট সংখ্যা: ${results.length}`,
        '',
      ];
      results.forEach((r, i) => {
        lines.push(`[#${i + 1}] ${r.url || ''}`);
        lines.push(`কমেন্ট: ${r.comments || 0} | শেয়ার: ${r.shares || 0} | লাইক: ${r.likes || 0}`);
        lines.push(`স্নিপেট: ${String(r.text || '').replace(/\\r?\n/g, ' ')}`);
        lines.push('');
      });
      fileContent = lines.join('\r\n');
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyLinks = async () => {
    if (!results.length) return;
    const links = results.map((r) => r.url).filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(links);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = links;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  };

  const copyDiagnostics = async () => {
    try {
      const response = await chrome.runtime.sendMessage<ExtensionMessage, ApiResponse>({ action: 'status' });
      const report = JSON.stringify(response, null, 2);
      await navigator.clipboard.writeText(report);
    } catch (err) {}
  };

  const active = Boolean(queue?.running || queue?.paused);
  const hasHistory = Boolean(queue && (queue.totalUrls || queue.processed?.length || queue.failed?.length));

  const query = searchQuery.toLowerCase().trim();
  const filteredResults = query
    ? results.filter(
        (r) =>
          (r.text && r.text.toLowerCase().includes(query)) ||
          (r.url && r.url.toLowerCase().includes(query)) ||
          String(r.comments).includes(query)
      )
    : results;

  return {
    theme,
    toggleTheme,
    queue,
    results,
    scannerState,
    queueUrls,
    setQueueUrls,
    searchQuery,
    setSearchQuery,
    limit,
    setLimit,
    minComments,
    setMinComments,
    speed,
    setSpeed,
    getValidUrls,
    handleStartQueue,
    sendQueueAction,
    exportResults,
    copyLinks,
    copyDiagnostics,
    active,
    hasHistory,
    filteredResults,
  };
}
