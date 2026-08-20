// Prohor Facebook Toolkit — single-tab sequential URL queue
import type {
  QueueState,
  PublicQueueState,
  ScanConfig,
  ScanCompleteMessage,
  ApiResponse,
  ExtensionMessage,
  StoredResults
} from './types';

const READY_RETRY_MS = 1000;
const MAX_READY_RETRIES = 45;
const QUEUE_STORAGE_KEY = 'commentFinderQueue';
const RESULTS_STORAGE_KEY = 'commentFinderResults';

const createQueueState = (): QueueState => ({
  running: false,
  paused: false,
  stopped: false,
  currentIndex: -1,
  totalUrls: 0,
  currentTabId: null,
  currentUrl: '',
  currentPageName: '',
  currentItemDone: false,
  readyCheckingUrl: '',
  scanStarted: false,
  queue: [],
  processed: [],
  failed: [],
  config: { limit: 100, minimumComments: 15, speed: 'normal' },
  message: 'প্রস্তুত',
  logs: []
});

let queueState: QueueState = createQueueState();
let stateLoaded = false;

async function loadQueueState(): Promise<void> {
  if (stateLoaded) return;
  const stored = await chrome.storage.local.get(QUEUE_STORAGE_KEY);
  const previous = stored[QUEUE_STORAGE_KEY] as Partial<QueueState> | undefined;
  if (previous && typeof previous === 'object') {
    queueState = { ...createQueueState(), ...previous };
  }
  stateLoaded = true;
}

async function persistQueueState(): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_STORAGE_KEY]: publicQueueState() });
}

function publicQueueState(): PublicQueueState {
  return {
    running: queueState.running,
    paused: queueState.paused,
    stopped: queueState.stopped,
    currentIndex: queueState.currentIndex,
    totalUrls: queueState.totalUrls,
    currentTabId: queueState.currentTabId,
    currentUrl: queueState.currentUrl,
    currentPageName: queueState.currentPageName,
    queue: [...queueState.queue],
    processed: queueState.processed.map(item => ({ ...item })),
    failed: queueState.failed.map(item => ({ ...item })),
    config: { ...queueState.config },
    message: queueState.message,
    logs: queueState.logs.slice(-30)
  };
}

async function publishQueueState(): Promise<void> {
  await persistQueueState();
  try {
    await chrome.runtime.sendMessage({ type: 'queueStatus', queue: publicQueueState() });
  } catch {
    // The popup may be closed; persisted state remains authoritative.
  }
}

function logQueue(message: string, data: string = ''): void {
  const entry = `${new Date().toLocaleTimeString()} — ${message}${data ? `: ${data}` : ''}`;
  queueState.logs.push(entry);
  if (queueState.logs.length > 100) queueState.logs.shift();
  console.log('[Queue]', entry);
}

function isFacebookUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value).trim());
    return /^https?:$/.test(url.protocol) && /(?:^|\.)facebook\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function normalizeQueueUrls(urls: unknown[]): string[] {
  const unique = new Set<string>();
  for (const value of urls || []) {
    const url = String(value || '').trim();
    if (!isFacebookUrl(url)) continue;
    unique.add(url);
  }
  return [...unique];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendToTab<T = unknown>(tabId: number, message: unknown): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message);
}

function sanitizeFileName(name: string): string {
  let safe = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safe)) safe += '_';
  return safe || 'facebook_page';
}

function cleanPostUrl(rawUrl: string): string {
  const value = String(rawUrl || '');
  if (!/^https?:\/\//i.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!/facebook\.com$/i.test(url.hostname) && !/\.facebook\.com$/i.test(url.hostname)) return value;

  url.hostname = 'www.facebook.com';
  if (/\/posts\/[^/]+$/.test(url.pathname)) return `${url.origin}${url.pathname}`;

  if (/\/photo\.php$/i.test(url.pathname)) {
    const fbid = url.searchParams.get('fbid');
    if (fbid) return `${url.origin}/photo.php?fbid=${encodeURIComponent(fbid)}`;
  }

  const tracking = /^(ref|mibextid|notif_id|_rdc|_rdr|eid|ftid|fref|rsrc|tn|set|comment_id|reply_comment_id|substory_index|locale|privacy_source)$/i;
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('__') || tracking.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.toString();
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function savePageResults(result: Partial<ScanCompleteMessage>): Promise<void> {
  if (!result.results?.length || !chrome.downloads?.download) return;

  const fileName = `${sanitizeFileName(result.fileName || result.pageName || 'facebook_page')}.txt`;
  const content = result.results
    .map(item => cleanPostUrl(item.url))
    .filter(Boolean)
    .join('\r\n');
  const url = `data:text/plain;charset=utf-8;base64,${utf8ToBase64(content)}`;

  try {
    await chrome.downloads.download({
      url,
      filename: fileName,
      conflictAction: 'uniquify',
      saveAs: false
    });
    logQueue('Saved page results', fileName);
  } catch (error: any) {
    logQueue('Could not save page results', error?.message || String(error));
  }
}

function isCurrentQueue(tabId: number): boolean {
  return queueState.running && queueState.currentTabId === tabId && queueState.currentIndex >= 0;
}

async function navigateToNextUrl(): Promise<void> {
  await loadQueueState();
  if (!queueState.running || queueState.paused) return;

  const nextIndex = queueState.currentIndex + 1;
  if (nextIndex >= queueState.queue.length) {
    await finishQueue();
    return;
  }

  const tabId = queueState.currentTabId;
  if (tabId === null) {
    await failCurrentUrl('No active tab ID found');
    return;
  }

  const url = queueState.queue[nextIndex];
  if (!url) {
    await finishQueue();
    return;
  }

  queueState.currentIndex = nextIndex;
  queueState.currentUrl = url;
  queueState.currentPageName = '';
  queueState.currentItemDone = false;
  queueState.readyCheckingUrl = '';
  queueState.scanStarted = false;
  queueState.message = `পেইজ লোড হচ্ছে ${nextIndex + 1}/${queueState.totalUrls}`;
  logQueue('Loading page', `${nextIndex + 1}/${queueState.totalUrls} → ${url}`);
  await publishQueueState();

  try {
    const tab = await chrome.tabs.update(tabId, { active: true, url });
    if (!tab) throw new Error('The queue tab is no longer available');
    // Usually onUpdated fires after this call. This fallback covers a tab that
    // was already complete when Chrome returned the update response.
    if (tab.status === 'complete') await beginReadyCheck(tabId, url);
  } catch (error: any) {
    await failCurrentUrl(`Navigation failed: ${error?.message || String(error)}`);
  }
}

async function beginReadyCheck(tabId: number, url: string): Promise<void> {
  await loadQueueState();
  if (!isCurrentQueue(tabId) || queueState.currentUrl !== url) return;
  if (queueState.readyCheckingUrl === url) return;
  queueState.readyCheckingUrl = url;
  await waitForContentScript(tabId, url, 0);
}

async function resumeCurrentPage(): Promise<void> {
  await loadQueueState();
  if (!queueState.running || queueState.paused || !queueState.currentTabId || !queueState.currentUrl) return;
  try {
    const tab = await chrome.tabs.get(queueState.currentTabId);
    if (tab?.status === 'complete') await beginReadyCheck(tab.id!, queueState.currentUrl);
  } catch {
    // The tab may have been closed; the onRemoved listener handles that case.
  }
}

async function waitForContentScript(tabId: number, url: string, attempt: number): Promise<void> {
  await loadQueueState();
  if (!isCurrentQueue(tabId) || queueState.currentUrl !== url) return;
  if (queueState.paused) {
    await sleep(READY_RETRY_MS);
    return waitForContentScript(tabId, url, attempt);
  }

  try {
    const response = await sendToTab<ApiResponse>(tabId, { action: 'status' });
    if (response?.state) {
      await startCurrentScan(tabId, url);
      return;
    }
  } catch {
    // document_idle has not installed the content script yet.
  }

  if (attempt >= MAX_READY_RETRIES) {
    await failCurrentUrl('Facebook page did not become ready');
    return;
  }
  await sleep(READY_RETRY_MS);
  await waitForContentScript(tabId, url, attempt + 1);
}

async function startCurrentScan(tabId: number, url: string): Promise<void> {
  await loadQueueState();
  if (!isCurrentQueue(tabId) || queueState.currentUrl !== url || queueState.scanStarted) return;
  queueState.scanStarted = true;
  queueState.currentPageName = '';
  queueState.message = `স্ক্যান করা হচ্ছে ${queueState.currentIndex + 1}/${queueState.totalUrls}`;
  await publishQueueState();

  try {
    const response = await sendToTab<ApiResponse>(tabId, {
      action: 'queueStart',
      config: queueState.config
    });
    if (!response?.success) throw new Error('The scanner did not start');
    logQueue('Scanner started', url);
    await publishQueueState();
  } catch (error: any) {
    await failCurrentUrl(`Scanner could not start: ${error?.message || String(error)}`);
  }
}

async function completeCurrentUrl(tabId: number, result: ScanCompleteMessage): Promise<void> {
  await loadQueueState();
  if (!isCurrentQueue(tabId) || queueState.currentItemDone) return;

  queueState.currentItemDone = true;
  const item = {
    url: queueState.currentUrl,
    pageName: result.pageName || queueState.currentUrl,
    scanned: result.scanned || 0,
    matched: result.results?.length || 0,
    completedAt: result.timestamp || new Date().toISOString()
  };
  queueState.processed.push(item);
  queueState.currentPageName = item.pageName;
  queueState.message = `সম্পন্ন পেইজ ${queueState.currentIndex + 1}/${queueState.totalUrls}`;
  logQueue('Page complete', `${item.pageName} — ${item.matched} matches`);

  const storedPayload: StoredResults = {
    results: result.results || [],
    scanned: item.scanned,
    matched: item.matched,
    pageName: item.pageName,
    fileName: result.fileName || item.pageName,
    timestamp: item.completedAt
  };

  await chrome.storage.local.set({
    [RESULTS_STORAGE_KEY]: storedPayload
  });
  await savePageResults(result);
  await publishQueueState();

  if (queueState.paused) return;
  await navigateToNextUrl();
}

async function failCurrentUrl(reason: string): Promise<void> {
  await loadQueueState();
  if (!queueState.running || queueState.currentIndex < 0 || queueState.currentItemDone) return;

  queueState.currentItemDone = true;
  queueState.failed.push({
    url: queueState.currentUrl,
    reason,
    failedAt: new Date().toISOString()
  });
  queueState.message = `বাদ দেওয়া পেইজ ${queueState.currentIndex + 1}/${queueState.totalUrls}`;
  logQueue('Page skipped', `${queueState.currentUrl} — ${reason}`);
  await publishQueueState();

  if (!queueState.paused) await navigateToNextUrl();
}

async function finishQueue(): Promise<void> {
  await loadQueueState();
  queueState.running = false;
  queueState.paused = false;
  queueState.currentTabId = null;
  queueState.message = `কিউ সম্পন্ন — ${queueState.processed.length} সম্পন্ন, ${queueState.failed.length} ব্যর্থ`;
  logQueue('Queue complete', `${queueState.processed.length} completed / ${queueState.failed.length} failed`);
  await publishQueueState();
}

async function startQueue(
  urls: string[],
  config: Partial<ScanConfig> | undefined,
  sendResponse: (response: ApiResponse) => void
): Promise<void> {
  await loadQueueState();
  if (queueState.running || queueState.paused) {
    sendResponse({ success: false, error: 'A queue is already running' });
    return;
  }

  const cleanUrls = normalizeQueueUrls(urls);
  if (!cleanUrls.length) {
    sendResponse({ success: false, error: 'Enter at least one valid Facebook URL' });
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.id) {
    sendResponse({ success: false, error: 'Could not find the active tab' });
    return;
  }

  const speedValue = config?.speed;
  const speed: ScanConfig['speed'] = speedValue === 'slow' || speedValue === 'fast' ? speedValue : 'normal';

  queueState = {
    ...createQueueState(),
    running: true,
    totalUrls: cleanUrls.length,
    currentTabId: activeTab.id,
    queue: cleanUrls,
    config: {
      limit: Math.max(1, Number(config?.limit) || 100),
      minimumComments: Math.max(0, Number(config?.minimumComments) || 15),
      speed
    },
    message: `${cleanUrls.length} টি পেইজ নিয়ে কিউ শুরু হচ্ছে`
  };

  await chrome.storage.local.remove(['commentFinder', RESULTS_STORAGE_KEY]);
  logQueue('Queue started', `${cleanUrls.length} URLs on tab ${activeTab.id}`);
  await publishQueueState();
  sendResponse({ success: true, queue: publicQueueState() });
  navigateToNextUrl().catch(error => console.error('[Queue] Navigation failed', error));
}

async function togglePauseQueue(): Promise<ApiResponse> {
  await loadQueueState();
  if (!queueState.running && !queueState.paused) return { success: false, error: 'No queue is running' };

  queueState.paused = !queueState.paused;
  queueState.message = queueState.paused ? 'কিউ পজ করা হয়েছে' : 'কিউ আবার শুরু করা হয়েছে';
  logQueue(queueState.paused ? 'কিউ পজ করা হয়েছে' : 'কিউ আবার শুরু করা হয়েছে');

  if (queueState.currentTabId) {
    try {
      await sendToTab(queueState.currentTabId, { action: 'pause' });
    } catch {
      // The tab may still be loading; the ready loop observes paused state.
    }
  }
  await publishQueueState();

  if (!queueState.paused && queueState.currentItemDone) await navigateToNextUrl();
  return { success: true, queue: publicQueueState() };
}

async function stopQueue(): Promise<ApiResponse> {
  await loadQueueState();
  if (!queueState.running && !queueState.paused) return { success: false, error: 'No queue is running' };

  const tabId = queueState.currentTabId;
  queueState.running = false;
  queueState.paused = false;
  queueState.stopped = true;
  queueState.currentTabId = null;
  queueState.message = 'কিউ বন্ধ করা হয়েছে';
  logQueue('কিউ বন্ধ করা হয়েছে');

  if (tabId) {
    try {
      await sendToTab(tabId, { action: 'stop' });
    } catch {
      // The active document may have navigated already.
    }
  }
  await publishQueueState();
  return { success: true, queue: publicQueueState() };
}

async function clearQueue(): Promise<ApiResponse> {
  await loadQueueState();
  if (queueState.running || queueState.paused) return { success: false, error: 'Stop the queue before clearing it' };

  queueState = createQueueState();
  await chrome.storage.local.remove([
    QUEUE_STORAGE_KEY,
    RESULTS_STORAGE_KEY,
    'commentFinder'
  ]);
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id) await sendToTab(activeTab.id, { action: 'clear' });
  } catch {
    // The active tab may not be a Facebook page.
  }
  return { success: true, queue: publicQueueState() };
}

// Queue state is persisted after every transition. MV3 may suspend and restart
// this worker while a scan is running; the next tab or message event reloads the
// persisted state instead of incorrectly marking the queue as interrupted.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  (async () => {
    try {
      await loadQueueState();
      await beginReadyCheck(tabId, queueState.currentUrl);
    } catch (error) {
      console.error('[Queue] Page readiness failed', error);
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    try {
      await loadQueueState();
      if (isCurrentQueue(tabId)) await failCurrentUrl('The queue tab was closed');
    } catch (error) {
      console.error('[Queue] Tab removal handling failed', error);
    }
  })();
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  (async () => {
    try {
      await loadQueueState();
      let response: ApiResponse | null = null;

      if ('type' in message && message.type === 'stateUpdate') {
        await chrome.storage.local.set({ commentFinder: message.state });
        const tabId = sender?.tab?.id;
        if (tabId && isCurrentQueue(tabId) && queueState.currentUrl) {
          beginReadyCheck(tabId, queueState.currentUrl).catch(error => console.error('[Queue] Readiness event failed', error));
        }
        response = { success: true };
      } else if ('type' in message && message.type === 'scanComplete') {
        const tabId = sender?.tab?.id;
        if (message.mode !== 'queue' || !tabId || !isCurrentQueue(tabId)) {
          response = { success: false, error: 'Ignored stale scan completion' };
        } else {
          await completeCurrentUrl(tabId, message);
          response = { success: true };
        }
      } else if ('action' in message) {
        switch (message.action) {
          case 'startQueue':
            await startQueue(message.urls, message.config, sendResponse);
            return;
          case 'pauseQueue':
            response = await togglePauseQueue();
            break;
          case 'stopQueue':
            response = await stopQueue();
            break;
          case 'clearQueue':
            response = await clearQueue();
            break;
          case 'queueStatus':
            await resumeCurrentPage();
            response = { success: true, queue: publicQueueState() };
            break;
          case 'openWindow':
            response = await openStandaloneWindow();
            break;
          default:
            response = { success: false, error: 'Unknown action' };
        }
      }

      if (response) sendResponse(response);
    } catch (error: any) {
      console.error('[Queue] Message failed', error);
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  })();
  return true;
});

async function openStandaloneWindow(): Promise<ApiResponse> {
  const width = 940;
  const height = 760;
  const popupWindow = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html?mode=window'),
    type: 'popup',
    width,
    height,
    focused: true
  });
  return { success: true, data: popupWindow };
}

// When clicking the extension icon in Chrome's toolbar, directly toggle the centered dialog
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id && tab.url && /facebook\.com/i.test(tab.url)) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
    } catch {
      // Content script may still be loading; navigate or open window
      await openStandaloneWindow();
    }
  } else {
    // If not on Facebook, open the standalone centered app window
    await openStandaloneWindow();
  }
});


