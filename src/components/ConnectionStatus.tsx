import React from 'react';
import { Wifi, WifiOff, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ConnectionStatusProps {
  connectionStatus: 'online' | 'offline' | 'syncing';
  hasUnsavedChanges: boolean;
  lastSyncTime: Date | null;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  connectionStatus,
  hasUnsavedChanges,
  lastSyncTime,
  className = ''
}) => {
  const getStatusDisplay = () => {
    if (connectionStatus === 'offline') {
      return {
        icon: <WifiOff className="h-3 w-3" />,
        label: 'Offline',
        variant: 'destructive' as const,
        description: hasUnsavedChanges ? 'Changes will sync when reconnected' : 'No connection'
      };
    }
    
    if (connectionStatus === 'syncing') {
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        label: 'Syncing...',
        variant: 'default' as const,
        description: 'Saving changes to the cloud'
      };
    }
    
    if (hasUnsavedChanges) {
      return {
        icon: <CloudOff className="h-3 w-3" />,
        label: 'Unsaved',
        variant: 'secondary' as const,
        description: 'Changes pending'
      };
    }
    
    return {
      icon: <Cloud className="h-3 w-3" />,
      label: 'Synced',
      variant: 'default' as const,
      description: lastSyncTime 
        ? `Last synced ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : 'All changes saved'
    };
  };

  const status = getStatusDisplay();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge variant={status.variant} className="gap-1 text-xs">
        {status.icon}
        <span>{status.label}</span>
      </Badge>
      
      {status.description && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {status.description}
        </span>
      )}
    </div>
  );
};