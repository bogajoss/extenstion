import React from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { MessageSquare, Share2, Heart, Link } from 'lucide-react';
import type { PostResult } from '../types';

interface ResultsListProps {
  results: PostResult[];
  query: string;
}

export function ResultsList({ results, query }: ResultsListProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-2 rounded-xl bg-muted/30 border space-y-2">
      {results.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground italic border-dashed shadow-sm">
          {query ? 'কোনো মিল পাওয়া যায়নি।' : 'এখনো কোনো ফলাফল পাওয়া যায়নি। পোস্ট খুঁজতে স্ক্যান চালান।'}
        </Card>
      ) : (
        results.map((result, idx) => {
          const href = result.url || '';
          return (
            <Card key={idx} className="p-3 flex gap-3 hover:border-primary transition-colors shadow-sm">
              <div className="font-bold text-xs text-muted-foreground min-w-[28px]">#{idx + 1}</div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="gap-1 text-xs bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"><MessageSquare className="w-3 h-3"/> {result.comments || 0}</Badge>
                  <Badge variant="outline" className="gap-1 text-xs border-yellow-500/30 text-yellow-600 bg-yellow-500/10 hover:bg-yellow-500/20"><Share2 className="w-3 h-3"/> {result.shares || 0}</Badge>
                  <Badge variant="destructive" className="gap-1 text-xs bg-red-500/10 text-red-600 hover:bg-red-500/20"><Heart className="w-3 h-3"/> {result.likes || 0}</Badge>
                </div>
                <div className="text-xs text-foreground/80 line-clamp-1">{result.text || 'কোনো পোস্ট স্নিপেট নেই'}</div>
                {href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
                    <Link className="w-3 h-3"/> পোস্ট দেখুন
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">কোনো পার্মালিংক নেই</span>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
