import React from 'react';
import { Check, Cloud, AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface AutoSaveIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  errorMessage?: string;
  lastSavedAt?: Date | null;
  className?: string;
}

export const AutoSaveIndicator: React.FC<AutoSaveIndicatorProps> = ({
  status,
  errorMessage,
  lastSavedAt,
  className
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'saving':
        return {
          icon: Loader2,
          label: 'Saving...',
          variant: 'secondary' as const,
          className: 'text-blue-600 border-blue-200 bg-blue-50'
        };
      case 'saved':
        return {
          icon: Check,
          label: 'Auto-saved',
          variant: 'secondary' as const,
          className: 'text-green-600 border-green-200 bg-green-50'
        };
      case 'error':
        return {
          icon: AlertTriangle,
          label: errorMessage || 'Save failed',
          variant: 'secondary' as const,
          className: 'text-red-600 border-red-200 bg-red-50'
        };
      default:
        return {
          icon: Cloud,
          label: 'Auto-save enabled',
          variant: 'secondary' as const,
          className: 'text-gray-600 border-gray-200 bg-gray-50'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Badge 
      variant={config.variant}
      className={`gap-2 ${config.className} ${className}`}
    >
      <Icon className={`h-3 w-3 ${status === 'saving' ? 'animate-spin' : ''}`} />
      <span className="text-xs">{config.label}</span>
    </Badge>
  );
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  }
}