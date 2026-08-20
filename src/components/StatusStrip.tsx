import React from 'react';
import { Badge } from './ui/badge';
import type { ScannerState, PublicQueueState } from '../types';

interface StatusStripProps {
  scannerState: ScannerState | null;
  queue: PublicQueueState | null;
}

export function StatusStrip({ scannerState, queue }: StatusStripProps) {
  return (
    <div className="flex items-center justify-between px-5 py-2 bg-muted/30 border-b text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        <span className="font-bold text-muted-foreground">{scannerState?.message || queue?.message || 'প্রস্তুত'}</span>
      </div>
      <Badge variant="outline" className="font-bold">{scannerState?.scanned || 0} / {scannerState?.limit || 100}</Badge>
    </div>
  );
}
