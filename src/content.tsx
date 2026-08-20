import { FinderOverlay } from './overlay';
import type {
  ScanConfig,
  ScannerState,
  PostResult,
  DiagnosticsData,
  DiagnosticsSample,
  ExtensionMessage
} from './types';

(() => {
  'use strict';

  let overlay: FinderOverlay | null = null;


  // ===== কনফিগারেশন =====
  const CONFIG: ScanConfig = {
    limit: 100,
    minimumComments: 15,
    speed: 'normal',
    developer: true
  };

  // ===== স্টেট =====
  const state: ScannerState = {
    running: false,
    paused: false,
    scanned: 0,
    matched: 0,
    results: [],
    message: 'প্রস্তুত',
    logs: [],
    network: navigator.onLine ? 'online' : 'offline',
    limit: CONFIG.limit,
    minimumComments: CONFIG.minimumComments
  };

  let processedHashes = new Set<string>();
  let processedNodes = new WeakSet<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scrollRetries = 0;
  let completionSent = false; // Send one completion message per queue page.

  // ===== হেলপার ফাংশন =====
  const clean = (text: unknown): string => String(text || '').replace(/\s+/g, ' ').trim();

  const parseNumber = (text: string): number => {
    if (!text) return 0;
    const banglaDigits = '০১২৩৪৫৬৭৮৯';
    const englishDigits = '0123456789';
    const banglaToEnglish = text.replace(/[\u09e6-\u09ef]/g, char => {
      const idx = banglaDigits.indexOf(char);
      return idx >= 0 ? englishDigits[idx]! : char;
    });
    const match = banglaToEnglish.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
    if (!match || !match[1]) return 0;
    const multiplierMap: Record<string, number> = { k: 1000, m: 1000000, b: 1000000000 };
    const unit = (match[2] || '').toLowerCase();
    const multiplier = multiplierMap[unit] || 1;
    return Math.round(parseFloat(match[1]) * multiplier);
  };

  const isVisible = (el: Element | null): boolean => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > -200 && rect.top < window.innerHeight * 1.5;
  };

  const log = (message: string, data: string = ''): void => {
    const entry = `${new Date().toLocaleTimeString()} — ${message}${data ? ': ' + data : ''}`;
    state.logs.push(entry);
    if (state.logs.length > 150) state.logs.shift();
    if (CONFIG.developer) console.log('[Finder]', entry);
  };

  const emitState = (): void => {
    state.matched = state.results.length;
    chrome.storage.local.set({ commentFinder: state });
    chrome.runtime.sendMessage({ type: 'stateUpdate', state }).catch(() => {});
    if (overlay) {
    }
  };

  // ===== পেজ নেম ডিটেকশন (queue page reports) =====
  function getUrlSlugName(): string {
    try {
      const u = new URL(window.location.href);
      let seg = u.pathname.replace(/\/+$/, '').split('/').pop();
      if (seg === 'profile.php') {
        const id = u.searchParams.get('id');
        return id ? `profile_${id}` : 'profile';
      }
      if (seg) {
        seg = decodeURIComponent(seg);
        if (/^\d+$/.test(seg)) return `page_${seg}`;
        return seg;
      }
    } catch {
      // Fallback below
    }
    return 'facebook_page';
  }

  // ===== জেনেরিক টাইটেল ফিল্টার =====
  const genericTitleRe = /^(facebook|home|notifications|messenger|marketplace|groups|watch|reels|saved|events|friends|pages|settings|search|profile|activity\s*log)$/i;
  const looksGeneric = (name: string): boolean => {
    if (!name) return true;
    if (genericTitleRe.test(name)) return true;
    if (name.length <= 60 && /facebook/i.test(name) && /[|\-–—]/.test(name)) return true;
    return false;
  };

  function isProfilePhpPage(): boolean {
    try {
      const u = new URL(window.location.href);
      const seg = u.pathname.replace(/\/+$/, '').split('/').pop();
      return seg === 'profile.php' && Boolean(u.searchParams.get('id'));
    } catch {
      return false;
    }
  }

  function getProfileNameFromTitle(): string {
    const m = String(document.title || '').match(/^(.+?)\s*[|\-–—]\s*Facebook\s*$/i);
    if (!m || !m[1]) return '';
    let name = clean(m[1]);
    name = name.replace(/\s+is on Facebook\s*$/i, '').trim();
    if (name.length < 2 || name.length > 80) return '';
    if (looksGeneric(name)) return '';
    return name;
  }

  function getProfileNameFromAria(): string {
    const elements = document.querySelectorAll<HTMLElement>('[aria-label]');
    for (const el of elements) {
      const label = String(el.getAttribute('aria-label') || '');
      const m = label.match(/^Search\s+(.+?)['’]s\s+profile\s*$/i);
      if (!m || !m[1]) continue;
      const name = clean(m[1]);
      if (name.length < 2 || name.length > 80) continue;
      if (looksGeneric(name)) continue;
      return name;
    }
    return '';
  }

  function getProfileNameFromDom(): string {
    const isUiContainer = (el: Element): boolean => Boolean(el.closest(
      '[data-pagelet*="About"], [data-pagelet*="Intro"], [data-pagelet*="FeedUnit"], ' +
      '[role="feed"], [role="complementary"], [role="dialog"]'
    ));

    const candidates = Array.from(document.querySelectorAll<HTMLElement>('h2[dir="auto"] > span[dir="auto"]'));
    const valid: { el: HTMLElement; name: string }[] = [];
    for (const span of candidates) {
      if (isUiContainer(span)) continue;
      const name = clean(span.innerText || span.textContent);
      if (name.length < 2 || name.length > 80) continue;
      if (looksGeneric(name)) continue;
      valid.push({ el: span, name });
    }
    if (valid.length === 0) return '';

    const headerScoped = valid.find(c =>
      c.el.closest('[data-pagelet="ProfileTabsPagelet"], [data-pagelet="ProfileApp"]')
    );
    if (headerScoped) return headerScoped.name;

    return valid[0]!.name;
  }

  function getPageNameOnce(): string {
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) {
      const name = clean(ogTitle.content);
      if (name.length > 0 && name.length <= 80 && !looksGeneric(name)) return name;
    }

    if (isProfilePhpPage()) {
      const ariaName = getProfileNameFromAria();
      if (ariaName) return ariaName;
    }

    const headerSelectors = [
      '[data-pagelet="ProfileTabsPagelet"] h1',
      '[data-pagelet="ProfileTabsPagelet"] span[dir="auto"]'
    ];
    if (isProfilePhpPage()) {
      headerSelectors.push('[data-pagelet="ProfileApp"] h1');
    }
    for (const selector of headerSelectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) continue;
      let name = clean(el.innerText || el.textContent);
      if (isProfilePhpPage()) name = name.replace(/\s+is on Facebook\s*$/i, '').trim();
      if (name.length > 1 && name.length <= 80 && !looksGeneric(name)) return name;
    }

    if (isProfilePhpPage()) {
      const domName = getProfileNameFromDom();
      if (domName) return domName;
    }

    if (isProfilePhpPage()) {
      const titleName = getProfileNameFromTitle();
      if (titleName) return titleName;
    }

    return getUrlSlugName();
  }

  function isFallbackName(name: string): boolean {
    if (!name) return true;
    if (name === 'facebook_page') return true;
    return name === getUrlSlugName();
  }

  async function getPageNameWithRetry(): Promise<string> {
    const first = getPageNameOnce();
    if (!isFallbackName(first)) return first;
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 400));
      const name = getPageNameOnce();
      if (!isFallbackName(name)) return name;
    }
    return getPageNameOnce();
  }

  function debugPageNameResolution(finalName: string): void {
    if (!isProfilePhpPage()) return;
    const ariaLabels = Array.from(document.querySelectorAll('[aria-label]'))
      .map(el => String(el.getAttribute('aria-label') || ''))
      .filter(l => /^Search\s+/i.test(l) && /['’]s\s+profile\s*$/i.test(l));
    console.log('[PageName DEBUG]', JSON.stringify({
      URL: window.location.href,
      isProfilePhpPage: isProfilePhpPage(),
      ariaCandidates: ariaLabels.length,
      ariaLabel: ariaLabels[0] || '',
      extractedName: getProfileNameFromAria(),
      domName: getProfileNameFromDom(),
      titleName: getProfileNameFromTitle(),
      slugName: getUrlSlugName(),
      finalName
    }, null, 2));
  }

  function sanitizeFileName(name: string): string {
    let safe = String(name || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 80);
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safe)) {
      safe = `${safe}_`;
    }
    return safe || 'facebook_page';
  }

  // ===== স্ক্যান সম্পূর্ণ হওয়ার সিগন্যাল =====
  async function sendScanComplete(reason?: string): Promise<void> {
    const pageName = await getPageNameWithRetry();
    debugPageNameResolution(pageName);
    chrome.runtime.sendMessage({
      type: 'scanComplete',
      finished: true,
      mode: 'queue',
      reason: reason || state.message,
      url: window.location.href,
      pageName,
      fileName: sanitizeFileName(pageName),
      results: state.results,
      scanned: state.scanned,
      matched: state.results.length,
      timestamp: new Date().toISOString()
    }).catch(() => {});
  }

  // ===== ভিডিও ইউটিলিটি ফাংশন =====
  function getVideoIdFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
      const u = new URL(url, window.location.origin);
      const v = u.searchParams.get('v') || u.searchParams.get('video_id');
      if (v && (/^\/watch(?:\/|$)/i.test(u.pathname) || /^\/video\.php$/i.test(u.pathname))) {
        return v;
      }
      const match = u.pathname.match(/\/(?:videos|reel|reels)\/(\d+)/i);
      if (match && match[1]) return match[1];
      return null;
    } catch {
      return null;
    }
  }

  function extractVideoUrl(node: HTMLElement): string | null {
    const videoEl = node.querySelector<HTMLVideoElement>('video');
    if (videoEl) {
      const src = videoEl.currentSrc || videoEl.src || videoEl.querySelector('source')?.src;
      if (src && !/^blob:/i.test(src)) return src;
    }

    const links = node.querySelectorAll<HTMLAnchorElement>('a[href]');
    for (const a of links) {
      const href = a.href || a.getAttribute('href');
      if (!href) continue;
      const videoId = getVideoIdFromUrl(href);
      if (videoId) {
        const url = new URL('https://www.facebook.com/watch/');
        url.searchParams.set('v', videoId);
        return url.toString();
      }
    }
    return null;
  }

  // ===== পোস্ট খোঁজা =====
  function findVisiblePosts(): HTMLElement[] {
    const posts: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    // ১. ফিড থেকে সরাসরি পোস্ট
    const feed = document.querySelector<HTMLElement>('[role="feed"]');
    if (feed) {
      for (const child of Array.from(feed.children) as HTMLElement[]) {
        const hasStory = child.querySelectorAll('[data-ad-rendering-role="story_message"]').length;
        const hasProfile = child.querySelectorAll('[data-ad-rendering-role="profile_name"]').length;
        if ((hasStory > 0 || hasProfile > 0) && hasStory <= 1 && hasProfile <= 1) {
          if (isVisible(child) && !seen.has(child)) {
            seen.add(child);
            posts.push(child);
          }
        }
      }
    }

    // ২. story_message থেকে প্যারেন্ট
    const storyElements = document.querySelectorAll<HTMLElement>('[data-ad-rendering-role="story_message"]');
    for (const el of storyElements) {
      const parent = getParentPostContainer(el);
      if (parent && isVisible(parent) && !seen.has(parent)) {
        seen.add(parent);
        posts.push(parent);
      }
    }

    // ৩. aria-label="Leave a comment" থেকে
    const commentButtons = document.querySelectorAll<HTMLElement>('[aria-label="Leave a comment"]');
    for (const btn of commentButtons) {
      let parent: HTMLElement | null =
        btn.closest<HTMLElement>('[role="article"]') ||
        btn.closest<HTMLElement>('[data-pagelet="FeedUnit"]') ||
        btn.closest<HTMLElement>('div[role="feed"] > div');
      if (!parent) {
        let el: HTMLElement | null = btn.parentElement;
        while (el && el !== document.body) {
          const link = el.querySelector('a[href*="/photo/?fbid="], a[href*="/posts/"], a[href*="story_fbid"], a[href*="/videos/"], a[href*="/reel/"]');
          if (link) {
            parent = el;
            break;
          }
          el = el.parentElement;
        }
      }
      if (parent && isVisible(parent) && !seen.has(parent)) {
        seen.add(parent);
        posts.push(parent);
      }
    }

    // ৪. ভিডিও/রিলস পোস্টের জন্য বিশেষ সিলেক্টর
    const videoContainers = document.querySelectorAll<HTMLElement>('[data-pagelet="FeedUnit_0"] > div, [data-xt="feed"] > div, div[role="article"]');
    for (const el of videoContainers) {
      if (seen.has(el) || !isVisible(el)) continue;
      const hasVideo = el.querySelector('video, [aria-label*="video" i], [aria-label*="Video" i], a[href*="/videos/"], a[href*="/reel/"]');
      if (hasVideo) {
        if (el.querySelector('[data-ad-rendering-role="profile_name"]') || el.querySelector('span[dir="auto"]')) {
          seen.add(el);
          posts.push(el);
        }
      }
    }

    posts.sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? -1 : 1));
    return posts;
  }

  function getParentPostContainer(element: Element): HTMLElement {
    let el: Element | null = element;
    let parent: HTMLElement | null = null;
    while (el && el.parentElement && el !== document.body) {
      const hasStory = el.querySelectorAll('[data-ad-rendering-role="story_message"]').length;
      const hasProfile = el.querySelectorAll('[data-ad-rendering-role="profile_name"]').length;
      if (hasStory > 0 && hasProfile > 0 && hasStory <= 1 && hasProfile <= 1) {
        parent = el as HTMLElement;
      }
      if (el.parentElement.matches && el.parentElement.matches('[role="feed"]')) {
        return parent || (el as HTMLElement);
      }
      el = el.parentElement;
    }
    return parent || (element as HTMLElement);
  }

  function findPostPermalinkIn(root: Element): string {
    const postLink = root.querySelector<HTMLAnchorElement>('a[href*="/posts/"]');
    if (postLink) {
      try {
        return normalizeUrl(new URL(postLink.href, window.location.href));
      } catch {}
    }

    const storyLink = root.querySelector<HTMLAnchorElement>('a[href*="story_fbid"]');
    if (storyLink) {
      try {
        return normalizeUrl(new URL(storyLink.href, window.location.href));
      } catch {}
    }

    const videoLink = root.querySelector<HTMLAnchorElement>('a[href*="/videos/"], a[href*="/watch/?v="], a[href*="/reel/"], a[href*="/permalink/"]');
    if (videoLink) {
      try {
        return normalizeUrl(new URL(videoLink.href, window.location.href));
      } catch {}
    }

    const photoLink = root.querySelector<HTMLAnchorElement>('a[href*="/photo/?fbid="], a[href*="/photo.php"]');
    if (photoLink) {
      try {
        const url = new URL(photoLink.href, window.location.origin);
        const fbid = url.searchParams.get('fbid');
        if (fbid) {
          const newUrl = new URL('https://www.facebook.com/photo.php');
          newUrl.searchParams.set('fbid', fbid);
          return normalizeUrl(newUrl);
        }
        return normalizeUrl(url);
      } catch {}
    }

    const allLinks = root.querySelectorAll<HTMLAnchorElement>('a[href]');
    for (const a of allLinks) {
      const href = a.href;
      if (href.includes('/posts/') || href.includes('story_fbid=') || href.includes('/videos/') || href.includes('/reel/') || href.includes('/permalink/')) {
        try {
          return normalizeUrl(new URL(href, window.location.href));
        } catch {}
      }
    }

    return '';
  }

  function extractPermalink(node: HTMLElement): string {
    const direct = findPostPermalinkIn(node);
    if (direct) return direct;

    let el: HTMLElement | null = node.parentElement;
    let hops = 0;
    while (el && el !== document.body && hops < 8) {
      if (el.matches && (el.matches('[data-pagelet^="FeedUnit"]') || el.matches('[role="article"]'))) {
        const found = findPostPermalinkIn(el);
        if (found) return found;
        break;
      }
      el = el.parentElement;
      hops++;
    }

    return '';
  }

  function normalizeUrl(url: URL): string {
    const cleanUrl = new URL(url.toString());
    const paramsToRemove = ['ref', 'mibextid', 'comment_id', 'reply_comment_id', 'notif_id', '__cft__', '__tn__', '_rdc', '_rdr', 'set'];
    paramsToRemove.forEach(p => cleanUrl.searchParams.delete(p));
    if (cleanUrl.hostname.includes('facebook.com')) {
      cleanUrl.hostname = 'www.facebook.com';
    }
    return cleanUrl.toString();
  }

  function getPostHash(node: HTMLElement): string | null {
    const permalink = extractPermalink(node);
    if (permalink) return `url_${permalink}`;

    const videoUrl = extractVideoUrl(node);
    if (videoUrl) {
      const id = getVideoIdFromUrl(videoUrl);
      if (id) return `video_${id}`;
    }

    const text = extractPostText(node);
    if (text) {
      const author = extractAuthor(node);
      const hash = simpleHash(`${author}\n${text}`);
      return `text_${hash}`;
    }
    return null;
  }

  function extractAuthor(node: HTMLElement): string {
    const profileEl = node.querySelector<HTMLElement>('[data-ad-rendering-role="profile_name"]');
    if (profileEl) {
      const nameEl = profileEl.querySelector<HTMLElement>('h2, h3, h4, b, strong');
      return clean(nameEl ? nameEl.innerText : profileEl.innerText);
    }
    return '';
  }

  function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function extractCounts(node: HTMLElement): { comments: number; likes: number; shares: number } {
    let comments = 0;
    let shares = 0;
    let likes = 0;

    const commentBtn = node.querySelector<HTMLElement>('[aria-label="Leave a comment"]');
    if (commentBtn) {
      const num = parseNumber(clean(commentBtn.textContent));
      if (num > 0) comments = num;
    }

    const shareBtn = node.querySelector<HTMLElement>('[aria-label="Send this to friends or post it on your profile."]');
    if (shareBtn) {
      const num = parseNumber(clean(shareBtn.textContent));
      if (num > 0) shares = num;
    }

    const likeBtn = node.querySelector<HTMLElement>('[aria-label="Like"]');
    if (likeBtn) {
      const num = parseNumber(clean(likeBtn.textContent));
      if (num > 0) likes = num;
    }

    if (comments === 0 || shares === 0) {
      const fullText = clean(node.innerText || '');
      const cMatch = fullText.match(/([\d,.]+)\s*(comments?|মন্তব্য)/i);
      if (cMatch && cMatch[1] && comments === 0) comments = parseNumber(cMatch[1]);
      const sMatch = fullText.match(/([\d,.]+)\s*(shares?|শেয়ার|শেয়ার)/i);
      if (sMatch && sMatch[1] && shares === 0) shares = parseNumber(sMatch[1]);
      const lMatch = fullText.match(/([\d,.]+)\s*(likes?|লাইক)/i);
      if (lMatch && lMatch[1] && likes === 0) likes = parseNumber(lMatch[1]);
    }

    return { comments, likes, shares };
  }

  function extractPostText(node: HTMLElement): string {
    const textEl = node.querySelector<HTMLElement>('[data-ad-rendering-role="story_message"]');
    if (textEl) {
      let text = clean(textEl.innerText);
      text = text.replace(/\s*See (?:more|less)$/i, '').trim();
      if (text.length > 5) return text.slice(0, 200);
    }

    const spans = node.querySelectorAll<HTMLElement>('div[dir="auto"], span[dir="auto"]');
    for (const span of spans) {
      if (span.closest('[role="button"]') || span.closest('form') || span.closest('ul')) continue;
      const text = clean(span.innerText);
      if (text.length > 10 && !/^(Like|Comment|Share|Reply|See more|Write a comment|Most relevant|View more comments)/i.test(text)) {
        return text.slice(0, 200);
      }
    }

    return clean(node.innerText || '').slice(0, 200);
  }

  function processPost(node: HTMLElement): boolean {
    if (processedNodes.has(node)) return false;
    processedNodes.add(node);

    const hash = getPostHash(node);
    if (!hash) {
      log('⏭️ Skip', 'No hash/permalink');
      return false;
    }
    if (processedHashes.has(hash)) {
      log('⏭️ Duplicate', hash);
      return false;
    }
    if (state.scanned >= CONFIG.limit) return false;

    processedHashes.add(hash);
    state.scanned++;

    const { comments, likes, shares } = extractCounts(node);
    const text = extractPostText(node);
    const url = extractPermalink(node) || `hash_${hash}`;

    log(`📊 #${state.scanned}`, `💬${comments} 🔄${shares} ❤️${likes} | ${text.slice(0, 30)}...`);

    if (comments < CONFIG.minimumComments) {
      log('⏭️ Skip', `Comments ${comments} < ${CONFIG.minimumComments}`);
      return false;
    }
    if (shares >= comments) {
      log('⏭️ Skip', `Shares ${shares} >= Comments ${comments}`);
      return false;
    }

    const result: PostResult = {
      url,
      comments,
      shares,
      likes,
      text,
      timestamp: new Date().toISOString()
    };
    state.results.push(result);
    log('✅ SAVED!', `${comments} comments, ${shares} shares`);
    return true;
  }

  function scan(): number {
    let discovered = 0;
    const posts = findVisiblePosts();
    log(`🔍 Found ${posts.length} posts on screen`);
    for (const post of posts) {
      if (state.scanned >= CONFIG.limit) break;
      if (processPost(post)) discovered++;
    }
    emitState();
    return discovered;
  }

  function scrollPage(): boolean {
    const prevScroll = window.scrollY;
    window.scrollBy({ top: Math.max(window.innerHeight * 0.7, 500), behavior: 'smooth' });
    
    const scrollableDivs = Array.from(document.querySelectorAll('div')).filter(d => {
      const style = window.getComputedStyle(d);
      return d.scrollHeight > d.clientHeight && d.clientHeight > 400 && (style.overflowY === 'auto' || style.overflowY === 'scroll');
    });
    for (const d of scrollableDivs) {
      d.scrollBy({ top: 500, behavior: 'smooth' });
    }

    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const atBottom = window.scrollY + window.innerHeight >= scrollHeight - 100;
    
    if (atBottom) {
      if (scrollRetries > 15) {
        finish(`✅ Done: Feed end (${state.scanned} scanned)`);
        return false;
      }
      scrollRetries++;
    } else {
      scrollRetries = 0;
    }
    return true;
  }

  function tick(): void {
    if (!state.running || state.paused) return;
    if (!navigator.onLine) {
      state.message = '⚠️ অফলাইন';
      emitState();
      schedule();
      return;
    }
    state.message = '🔍 স্ক্যান করা হচ্ছে...';
    scan();
    if (state.scanned < CONFIG.limit) scrollPage();
    if (state.scanned >= CONFIG.limit) {
      finish(`✅ Complete: ${CONFIG.limit} posts scanned`);
      return;
    }
    schedule();
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    const delay = CONFIG.speed === 'fast' ? 800 : CONFIG.speed === 'slow' ? 2000 : 1200;
    timer = setTimeout(tick, delay);
  }

  function finish(message: string): void {
    if (timer) clearTimeout(timer);
    const wasRunning = state.running;
    state.running = false;
    state.paused = false;
    state.message = message;
    log('🏁', message);
    if (wasRunning && !completionSent) {
      completionSent = true;
      sendScanComplete(message);
    }
    emitState();
  }

  function start(config: Partial<ScanConfig> = {}): void {
    if (timer) clearTimeout(timer);
    processedHashes = new Set();
    processedNodes = new WeakSet();
    completionSent = false;
    Object.assign(CONFIG, {
      limit: config.limit || 100,
      minimumComments: config.minimumComments || 15,
      speed: config.speed || 'normal'
    });
    Object.assign(state, {
      running: true,
      paused: false,
      scanned: 0,
      matched: 0,
      results: [],
      message: '🚀 শুরু হয়েছে',
      network: navigator.onLine ? 'online' : 'offline',
      limit: CONFIG.limit,
      minimumComments: CONFIG.minimumComments
    });
    scrollRetries = 0;
    log('🚀 START', `Limit ${CONFIG.limit}, Min ${CONFIG.minimumComments}`);
    emitState();
    tick();
  }

  function pause(): void {
    if (!state.running) return;
    state.paused = !state.paused;
    state.message = state.paused ? '⏸️ পজ করা হয়েছে' : '▶️ স্ক্যান করা হচ্ছে';
    log(state.paused ? '⏸️ পজ করা হয়েছে' : '▶️ আবার শুরু হয়েছে');
    emitState();
    if (!state.paused) tick();
  }

  function stop(): void {
    finish(`⏹️ Stopped: ${state.scanned} scanned`);
  }

  function clearResults(): void {
    state.results = [];
    state.matched = 0;
    state.message = '🗑️ মুছে ফেলা হয়েছে';
    log('🗑️ Cleared');
    emitState();
  }

  function getDiagnostics(): DiagnosticsData {
    const posts = findVisiblePosts();
    const samples: DiagnosticsSample[] = posts.slice(0, 5).map(node => {
      const c = extractCounts(node);
      return {
        hasPermalink: Boolean(extractPermalink(node)),
        comments: c.comments,
        shares: c.shares,
        likes: c.likes,
        text: extractPostText(node).slice(0, 80)
      };
    });
    return {
      timestamp: new Date().toISOString(),
      network: navigator.onLine ? 'online' : 'offline',
      postsFound: posts.length,
      scanned: state.scanned,
      matched: state.matched,
      resultsCount: state.results.length,
      samples,
      logs: state.logs.slice(-20),
      config: CONFIG
    };
  }

  // ===== মেসেজ হ্যান্ডলার =====
  chrome.runtime.onMessage.addListener((msg: ExtensionMessage, sender, sendResponse) => {
    if ('action' in msg) {
      if (msg.action === 'queueStart') {
        start(msg.config);
        sendResponse({ success: true });
      } else if (msg.action === 'pause') {
        pause();
        sendResponse({ success: true });
      } else if (msg.action === 'stop') {
        stop();
        sendResponse({ success: true });
      } else if (msg.action === 'clear') {
        clearResults();
        sendResponse({ success: true });
      } else if (msg.action === 'status') {
        sendResponse({ state, pageName: getPageNameOnce() });
      } else if (msg.action === 'diagnostics') {
        sendResponse({ diagnostics: getDiagnostics() });
      } else if (msg.action === 'toggleOverlay') {
        if (!overlay) overlay = new FinderOverlay();
        overlay.toggle();
        sendResponse({ success: true });
      } else if (msg.action === 'openOverlay') {
        if (!overlay) overlay = new FinderOverlay();
        overlay.open();
        sendResponse({ success: true });
      } else if (msg.action === 'closeOverlay') {
        overlay?.close();
        sendResponse({ success: true });
      }
    }
    return true;
  });

  // Initialize in-page overlay UI
  try {
    overlay = new FinderOverlay();
  } catch (e) {
    console.error('[Finder] Could not initialize overlay:', e);
  }

  log('✅ Content script loaded (with video/reel support and Centered Dialog UI)');
  emitState();
})();

