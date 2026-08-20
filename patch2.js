const fs = require('fs');
let code = fs.readFileSync('src/background.tsx', 'utf8');

const targetStr = `  let targetTabId;
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
      targetTabId = win?.tabs?.[0]?.id;
    }
  }`;

const replacementStr = `  let targetTabId;
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

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/background.tsx', code);
  console.log('Patched background.tsx successfully');
} else {
  console.log('Target string not found');
}
