import React from 'react';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { Button } from './ui/button';
import { Play, Pause, Square, Trash2, Search } from 'lucide-react';
import type { PublicQueueState } from '../types';

interface SettingsCardProps {
  limit: number;
  setLimit: (limit: number) => void;
  minComments: number;
  setMinComments: (min: number) => void;
  speed: 'slow' | 'normal' | 'fast';
  setSpeed: (speed: 'slow' | 'normal' | 'fast') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  active: boolean;
  queue: PublicQueueState | null;
  sendQueueAction: (action: 'pauseQueue' | 'stopQueue' | 'clearQueue') => void;
}

export function SettingsCard({
  limit, setLimit,
  minComments, setMinComments,
  speed, setSpeed,
  searchQuery, setSearchQuery,
  active, queue, sendQueueAction
}: SettingsCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 gap-3 flex flex-col">
        <div className="text-sm font-medium">স্ক্যান সেটিংস এবং অ্যাকশন</div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">লিমিট</label>
            <Input type="number" min="1" max="500" value={limit} onChange={e => setLimit(Number(e.target.value))} disabled={active} className="h-8" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ন্যূনতম কমেন্ট</label>
            <Input type="number" min="0" max="1000" value={minComments} onChange={e => setMinComments(Number(e.target.value))} disabled={active} className="h-8" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">গতি</label>
            <Select value={speed} onValueChange={(val) => val && setSpeed(val as 'slow'|'normal'|'fast')} disabled={active}>
              <SelectTrigger className="h-8"><SelectValue placeholder="গতি" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="slow">ধীর</SelectItem>
                <SelectItem value="normal">সাধারণ</SelectItem>
                <SelectItem value="fast">দ্রুত</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="secondary" className="flex-1 h-8 text-xs font-bold bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400 border border-yellow-500/20" onClick={() => sendQueueAction('pauseQueue')} disabled={!active}>
            {queue?.paused ? <><Play className="w-3 h-3 mr-1" /> চালিয়ে যান</> : <><Pause className="w-3 h-3 mr-1" /> বিরতি</>}
          </Button>
          <Button variant="destructive" className="flex-1 h-8 text-xs font-bold" onClick={() => sendQueueAction('stopQueue')} disabled={!active}>
            <Square className="w-3 h-3 mr-1" /> বন্ধ করুন
          </Button>
          <Button variant="outline" className="flex-1 h-8 text-xs font-bold" onClick={() => sendQueueAction('clearQueue')} disabled={active}>
            <Trash2 className="w-3 h-3 mr-1" /> মুছে ফেলুন
          </Button>
        </div>

        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="স্ক্যান করা ফলাফল ফিল্টার করুন..." className="pl-8 h-8 text-xs" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}
