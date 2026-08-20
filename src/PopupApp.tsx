import React from 'react';
import { Button } from './components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { Link, Search } from 'lucide-react';
import { useScanner } from './hooks/useScanner';
import { Header } from './components/Header';
import { StatusStrip } from './components/StatusStrip';
import { QueueCard } from './components/QueueCard';
import { SettingsCard } from './components/SettingsCard';
import { ExportToolbar } from './components/ExportToolbar';
import { ResultsList } from './components/ResultsList';

export function PopupApp() {
  const scanner = useScanner();

  const openOverlay = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { action: 'openOverlay' });
        window.close();
      }
    } catch {}
  };

  const openWindow = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'openWindow' });
      window.close();
    } catch {}
  };

  return (
    <div className="w-[800px] h-[600px] flex flex-col p-4 bg-background text-foreground space-y-4 font-sans">
      <Header
        title="পোস্ট ফাইন্ডার প্রো"
        subtitle="মাল্টি-পেইজ কিউ এবং ফিড স্ক্যানার"
        theme={scanner.theme}
        toggleTheme={scanner.toggleTheme}
        className="pb-2 border-b"
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={openOverlay}>
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>ওভারলে খুলুন</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={openWindow}>
                  <Link className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>উইন্ডো খুলুন</TooltipContent>
            </Tooltip>
          </>
        }
      />
      
      <StatusStrip scannerState={scanner.scannerState} queue={scanner.queue} />

      <div className="grid grid-cols-2 gap-4">
        <QueueCard 
          queueUrls={scanner.queueUrls}
          setQueueUrls={scanner.setQueueUrls}
          validUrlsCount={scanner.getValidUrls().length}
          active={scanner.active}
          hasHistory={scanner.hasHistory}
          queue={scanner.queue}
          handleStartQueue={scanner.handleStartQueue}
        />

        <SettingsCard 
          limit={scanner.limit}
          setLimit={scanner.setLimit}
          minComments={scanner.minComments}
          setMinComments={scanner.setMinComments}
          speed={scanner.speed}
          setSpeed={scanner.setSpeed}
          searchQuery={scanner.searchQuery}
          setSearchQuery={scanner.setSearchQuery}
          active={scanner.active}
          queue={scanner.queue}
          sendQueueAction={scanner.sendQueueAction}
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col pt-2 border-t">
        <ExportToolbar 
          resultCount={scanner.filteredResults.length}
          exportResults={scanner.exportResults}
          copyLinks={scanner.copyLinks}
        />
        <ResultsList results={scanner.filteredResults} query={scanner.searchQuery} />
      </div>
    </div>
  );
}
