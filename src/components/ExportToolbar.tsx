import React from 'react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Download, FileSpreadsheet, FileJson, Copy, Search } from 'lucide-react';
import type { ExportFormat } from '../types';

interface ExportToolbarProps {
  resultCount: number;
  exportResults: (format: ExportFormat) => void;
  copyLinks: () => void;
  copyDiagnostics?: () => void;
}

export function ExportToolbar({ resultCount, exportResults, copyLinks, copyDiagnostics }: ExportToolbarProps) {
  return (
    <div className="flex items-center justify-between pb-3 flex-none">
      <span className="text-sm font-bold">স্ক্যান করা পোস্ট (<span className="text-primary">{resultCount}</span>)</span>
      
      <div className="flex gap-1">
        <TooltipProvider>
          <Tooltip><TooltipTrigger render={
<Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => exportResults('txt')}><Download className="w-3 h-3 mr-1"/> TXT</Button>
} /><TooltipContent>TXT এ এক্সপোর্ট করুন</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger render={
<Button variant="outline" size="sm" className="h-7 text-xs px-2 text-green-600 border-green-600 hover:bg-green-600 hover:text-white" onClick={() => exportResults('csv')}><FileSpreadsheet className="w-3 h-3 mr-1"/> CSV</Button>
} /><TooltipContent>CSV তে এক্সপোর্ট করুন</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger render={
<Button variant="outline" size="sm" className="h-7 text-xs px-2 text-yellow-600 border-yellow-600 hover:bg-yellow-600 hover:text-white" onClick={() => exportResults('json')}><FileJson className="w-3 h-3 mr-1"/> JSON</Button>
} /><TooltipContent>JSON এ এক্সপোর্ট করুন</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger render={
<Button variant="default" size="sm" className="h-7 text-xs px-2 font-bold" onClick={copyLinks}><Copy className="w-3 h-3 mr-1"/> লিংক</Button>
} /><TooltipContent>ইউআরএল কপি করুন</TooltipContent></Tooltip>
          {copyDiagnostics && (
            <Tooltip><TooltipTrigger render={
<Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={copyDiagnostics}><Search className="w-3 h-3"/></Button>
} /><TooltipContent>ডায়াগনস্টিক্স</TooltipContent></Tooltip>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}
