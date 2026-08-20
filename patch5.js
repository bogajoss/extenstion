const fs = require('fs');
let code = fs.readFileSync('src/background.tsx', 'utf8');

const targetStr = `  let targetTabId;
  const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const targetWindow = normalWindows.find(w => w.id !== undefined);
  if (targetWindow?.id) {
    // Open in background so we don't close the popup
    const tab = await chrome.tabs.create({ windowId: targetWindow.id, url: 'about:blank', active: false });
    targetTabId = tab.id;
  } else {
    const win = await chrome.windows.create({ url: 'about:blank', type: 'normal', focused: false });
    targetTabId = win?.tabs?.[0]?.id;
  }`;

const replacementStr = `  let targetTabId;
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  
  if (activeTab?.id && !activeTab.url?.startsWith('chrome-extension://')) {
    // We are in a normal tab. Reuse it.
    targetTabId = activeTab.id;
  } else {
    // We are in the toolkit standalone window or popup. We MUST create a new tab in a normal window 
    // and MAKE IT ACTIVE so Chrome doesn't throttle the scrolling/JS.
    const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const targetWindow = normalWindows.find(w => w.id !== undefined);
    if (targetWindow?.id) {
      const tab = await chrome.tabs.create({ windowId: targetWindow.id, url: 'about:blank', active: true });
      targetTabId = tab.id;
      // Focus the window so the tab isn't throttled
      await chrome.windows.update(targetWindow.id, { focused: true });
    } else {
      const win = await chrome.windows.create({ url: 'about:blank', type: 'normal', focused: true });
      targetTabId = win?.tabs?.[0]?.id;
    }
  }`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/background.tsx', code);
  console.log('Patched background.tsx target tab logic');
} else {
  console.log('Target string not found');
}
