import React from 'react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Sun, Moon, Link, Search, Minimize2, X, BarChart3 } from 'lucide-react';
import type { ThemeMode } from '../types';

interface HeaderProps {
  title: string;
  subtitle: string;
  theme: ThemeMode;
  toggleTheme: () => void;
  actions?: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void;
  isDragging?: boolean;
  className?: string;
}

export function Header({ title, subtitle, theme, toggleTheme, actions, onMouseDown, isDragging, className = '' }: HeaderProps) {
  return (
    <div 
      className={`flex justify-between items-center ${className} ${isDragging ? 'cursor-grabbing' : onMouseDown ? 'cursor-grab' : ''}`}
      onMouseDown={onMouseDown}
    >
      <div className="flex gap-3 items-center">
        <div className="bg-primary text-primary-foreground rounded-lg p-1.5 hidden md:block">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold leading-tight">{title}</h1>
          <p className="text-sm text-muted-foreground font-medium">{subtitle}</p>
        </div>
      </div>
      <div className="flex gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={
<Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
} />
            <TooltipContent>থিম পরিবর্তন করুন</TooltipContent>
          </Tooltip>
          {actions}
        </TooltipProvider>
      </div>
    </div>
  );
}
