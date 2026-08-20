import React from 'react';
import { Card, CardContent } from './ui/card';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Link, Play } from 'lucide-react';
import type { PublicQueueState } from '../types';

interface QueueCardProps {
  queueUrls: string;
  setQueueUrls: (urls: string) => void;
  validUrlsCount: number;
  active: boolean;
  hasHistory: boolean;
  queue: PublicQueueState | null;
  handleStartQueue: () => void;
}

export function QueueCard({ queueUrls, setQueueUrls, validUrlsCount, active, hasHistory, queue, handleStartQueue }: QueueCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 gap-3 flex flex-col">
        <div className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2"><Link className="w-4 h-4 text-primary" /> পেইজ ইউআরএল কিউ</span>
          <Badge variant="outline" className="font-normal">{validUrlsCount} ইউআরএল</Badge>
        </div>
        
        <Textarea 
          rows={3} 
          placeholder="https://www.facebook.com/page-one&#10;https://www.facebook.com/page-two" 
          className="resize-none text-xs font-mono w-full"
          value={queueUrls}
          onChange={(e) => setQueueUrls(e.target.value)}
          disabled={active}
        />
        
        <Button onClick={handleStartQueue} disabled={active} className="w-full font-bold">
          <Play className="w-4 h-4 mr-2" /> সিরিজ কিউ চালান
        </Button>

        {(active || hasHistory) && (
          <div className="mt-2 flex flex-col gap-1 text-xs border rounded-md p-3 bg-muted/20">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="flex items-center gap-1"><Play className="w-3 h-3"/> অগ্রগতি</span>
              <Badge variant={active ? "default" : "secondary"}>{active ? 'চলমান…' : 'সম্পন্ন'}</Badge>
            </div>
            <div className="text-lg font-semibold truncate text-primary my-1">{queue?.currentPageName || '-'}</div>
            <div className="flex justify-between font-medium mt-1">
              <span className="text-muted-foreground">পেইজ: {queue?.totalUrls ? `${Math.min(Math.max((queue.currentIndex || 0) + 1, 1), queue.totalUrls)} / ${queue.totalUrls}` : '-'}</span>
              <span className="text-green-600 dark:text-green-400">সম্পন্ন: {queue?.processed?.length || 0}</span>
              <span className="text-red-600 dark:text-red-400">ব্যর্থ: {queue?.failed?.length || 0}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
