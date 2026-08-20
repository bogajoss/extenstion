const fs = require('fs');
let code = fs.readFileSync('src/background.tsx', 'utf8');

const targetStr = `  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab?.id) {
    sendResponse({ success: false, error: 'Could not find the active tab' });
    return;
  }`;

const replacementStr = `  let targetTabId;
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  
  if (activeTab?.id && !activeTab.url?.startsWith('chrome-extension://')) {
    targetTabId = activeTab.id;
  } else {
    const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const targetWindow = normalWindows.find(w => w.id !== undefined);
    if (targetWindow?.id) {
      const tab = await chrome.tabs.create({ windowId: targetWindow.id, url: 'about:blank', active: true });
      targetTabId = tab.id;
    } else {
      const win = await chrome.windows.create({ url: 'about:blank', type: 'normal' });
      targetTabId = win.tabs?.[0]?.id;
    }
  }

  if (!targetTabId) {
    sendResponse({ success: false, error: 'Could not find or create a tab' });
    return;
  }`;

code = code.replace(targetStr, replacementStr);
code = code.replace(/currentTabId: activeTab\.id,/, 'currentTabId: targetTabId,');
code = code.replace(/on tab \${activeTab\.id}/, 'on tab ${targetTabId}');

fs.writeFileSync('src/background.tsx', code);
