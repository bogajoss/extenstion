import React, { useState, useEffect, useRef } from 'react';
import { Button } from './components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { Badge } from './components/ui/badge';
import { Search, Minimize2, X, Pause, Square } from 'lucide-react';
import { useScanner } from './hooks/useScanner';
import { Header } from './components/Header';
import { StatusStrip } from './components/StatusStrip';
import { QueueCard } from './components/QueueCard';
import { SettingsCard } from './components/SettingsCard';
import { ExportToolbar } from './components/ExportToolbar';
import { ResultsList } from './components/ResultsList';

interface OverlayAppProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function OverlayApp({ isOpen, onClose, onToggle }: OverlayAppProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const scanner = useScanner();

  useEffect(() => {
    if (!isOpen) return;
    setIsMinimized(false);
  }, [isOpen]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isMinimized) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMinimized, onClose]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
    if (!containerRef.current) return;
    
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = rect.left;
    const initialTop = rect.top;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setPosition({
        x: Math.max(10, Math.min(window.innerWidth - rect.width - 10, initialLeft + dx)),
        y: Math.max(10, Math.min(window.innerHeight - rect.height - 10, initialTop + dy))
      });
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const themeClass = scanner.theme === 'dark' ? 'dark' : '';

  if (!isOpen) {
    return (
      <div className={`${themeClass}`}>
        <div 
          onClick={onToggle}
          className="fixed bottom-6 right-6 z-[2147483647] flex items-center gap-2 bg-background border shadow-2xl rounded-full p-2 cursor-pointer hover:bg-accent text-foreground"
        >
          <Search className="w-5 h-5 text-primary" />
        </div>
      </div>
    );
  }

  if (isMinimized) {
    return (
      <div className={`${themeClass}`}>
        <div className="fixed bottom-6 right-6 z-[2147483647] flex items-center gap-2 bg-background border shadow-2xl rounded-full p-2 pl-4 text-foreground">
          <Button variant="ghost" size="sm" className="gap-2 font-bold rounded-full" onClick={() => setIsMinimized(false)}>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-sm">{scanner.scannerState?.message || 'স্ক্যানিং'}</span>
            <Badge variant="default" className="text-xs">{scanner.scannerState?.scanned || 0}/{scanner.scannerState?.limit || 100}</Badge>
          </Button>
          {scanner.active && (
            <div className="flex gap-1 pr-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10" onClick={() => scanner.sendQueueAction('pauseQueue')}>
                <Pause className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-500/10" onClick={() => scanner.sendQueueAction('stopQueue')}>
                <Square className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClass}`}>
      <div className="dialog-backdrop text-foreground" onClick={(e) => { if(e.target === e.currentTarget) onClose(); }}>
        <div 
          ref={containerRef}
          className="dialog-box bg-background text-foreground shadow-2xl rounded-xl flex flex-col overflow-hidden select-none border"
          style={position.x !== 0 || position.y !== 0 ? { position: 'fixed', left: position.x, top: position.y, transform: 'none' } : {}}
        >
          <Header
            title="প্রহর ফেসবুক টুলকিট"
            subtitle="মাল্টি-পেইজ কিউ এবং ফিড স্ক্যানার"
            theme={scanner.theme}
            toggleTheme={scanner.toggleTheme}
            className="bg-muted/50 border-b min-h-12 px-4 py-2"
            onMouseDown={handleMouseDown}
            isDragging={isDragging}
            actions={
              <>
                <Tooltip>
                  <TooltipTrigger render={
<Button variant="ghost" size="icon" onClick={() => setIsMinimized(true)}>
                      <Minimize2 className="w-4 h-4" />
                    </Button>
} />
                  <TooltipContent>হুড এ মিনিমাইজ করুন</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger render={
<Button variant="ghost" size="icon" className="hover:bg-destructive hover:text-destructive-foreground" onClick={onClose}>
                      <X className="w-4 h-4" />
                    </Button>
} />
                  <TooltipContent>বন্ধ করুন</TooltipContent>
                </Tooltip>
              </>
            }
          />

          <StatusStrip scannerState={scanner.scannerState} queue={scanner.queue} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 flex-none">
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

          <div className="flex-1 min-h-0 flex flex-col px-4 pb-4 overflow-hidden">
            <ExportToolbar 
              resultCount={scanner.filteredResults.length}
              exportResults={scanner.exportResults}
              copyLinks={scanner.copyLinks}
              copyDiagnostics={scanner.copyDiagnostics}
            />
            <ResultsList results={scanner.filteredResults} query={scanner.searchQuery} />
          </div>
        </div>
      </div>
    </div>
  );
}
