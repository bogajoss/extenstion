export type ScanSpeed = 'slow' | 'normal' | 'fast';
export type ThemeMode = 'dark' | 'light' | 'system';
export type ExportFormat = 'txt' | 'csv' | 'json';

export interface ScanConfig {
  limit: number;
  minimumComments: number;
  speed: ScanSpeed;
  developer?: boolean;
}

export interface PostResult {
  url: string;
  comments: number;
  shares: number;
  likes: number;
  text: string;
  timestamp: string;
}

export interface ProcessedItem {
  url: string;
  pageName: string;
  scanned: number;
  matched: number;
  completedAt: string;
}

export interface FailedItem {
  url: string;
  reason: string;
  failedAt: string;
}

export interface QueueState {
  running: boolean;
  paused: boolean;
  stopped: boolean;
  currentIndex: number;
  totalUrls: number;
  currentTabId: number | null;
  currentUrl: string;
  currentPageName: string;
  currentItemDone: boolean;
  readyCheckingUrl: string;
  scanStarted: boolean;
  queue: string[];
  processed: ProcessedItem[];
  failed: FailedItem[];
  config: ScanConfig;
  message: string;
  logs: string[];
}

export type PublicQueueState = Omit<
  QueueState,
  'currentItemDone' | 'readyCheckingUrl' | 'scanStarted'
>;

export interface ScannerState {
  running: boolean;
  paused: boolean;
  scanned: number;
  matched: number;
  results: PostResult[];
  message: string;
  logs: string[];
  network: 'online' | 'offline';
  limit: number;
  minimumComments: number;
}

export interface StoredResults {
  results: PostResult[];
  scanned: number;
  matched: number;
  pageName: string;
  fileName: string;
  timestamp: string;
}

export interface DiagnosticsSample {
  hasPermalink: boolean;
  comments: number;
  shares: number;
  likes: number;
  text: string;
}

export interface DiagnosticsData {
  timestamp: string;
  network: 'online' | 'offline';
  postsFound: number;
  scanned: number;
  matched: number;
  resultsCount: number;
  samples: DiagnosticsSample[];
  logs: string[];
  config: ScanConfig;
}

export interface ScanCompleteMessage {
  type: 'scanComplete';
  finished: boolean;
  mode: 'queue';
  reason: string;
  url: string;
  pageName: string;
  fileName: string;
  results: PostResult[];
  scanned: number;
  matched: number;
  timestamp: string;
}

export interface StateUpdateMessage {
  type: 'stateUpdate';
  state: ScannerState;
}

export interface QueueStatusMessage {
  type: 'queueStatus';
  queue: PublicQueueState;
}

export type ExtensionMessage =
  | { action: 'startQueue'; urls: string[]; config: Partial<ScanConfig> }
  | { action: 'pauseQueue' }
  | { action: 'stopQueue' }
  | { action: 'clearQueue' }
  | { action: 'queueStatus' }
  | { action: 'queueStart'; config: ScanConfig }
  | { action: 'pause' }
  | { action: 'stop' }
  | { action: 'clear' }
  | { action: 'status' }
  | { action: 'diagnostics' }
  | { action: 'toggleOverlay' }
  | { action: 'openOverlay' }
  | { action: 'closeOverlay' }
  | { action: 'openWindow' }
  | StateUpdateMessage
  | ScanCompleteMessage
  | QueueStatusMessage;

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  queue?: PublicQueueState;
  state?: ScannerState;
  pageName?: string;
  diagnostics?: DiagnosticsData;
  data?: T;
}
