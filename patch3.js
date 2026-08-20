const fs = require('fs');
let code = fs.readFileSync('src/content.tsx', 'utf8');

const targetStr = `  function scrollPage(): boolean {
    const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const atBottom = window.scrollY + window.innerHeight >= scrollHeight - 100;
    if (atBottom) {
      if (scrollRetries > 10) {
        finish(\`✅ Done: Feed end (\${state.scanned} scanned)\`);
        return false;
      }
      scrollRetries++;
    } else {
      scrollRetries = 0;
    }
    window.scrollBy({ top: Math.max(window.innerHeight * 0.7, 500), behavior: 'smooth' });
    return true;
  }`;

const replacementStr = `  function scrollPage(): boolean {
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
        finish(\`✅ Done: Feed end (\${state.scanned} scanned)\`);
        return false;
      }
      scrollRetries++;
    } else {
      scrollRetries = 0;
    }
    return true;
  }`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/content.tsx', code);
  console.log('Patched content.tsx scrollPage successfully');
} else {
  console.log('Target string not found');
}
