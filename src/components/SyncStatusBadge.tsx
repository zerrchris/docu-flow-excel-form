import React, { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { syncService, SyncStatus } from '@/utils/syncService';
import { offlineStorage } from '@/utils/offlineStorage';
import { CloudIcon, CloudOffIcon, RotateCwIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react';

export const SyncStatusBadge: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ status: 'idle' });
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Initialize offline storage
    offlineStorage.initDB();

    // Set up sync status listener
    const unsubscribe = syncService.onSyncStatusChange(setSyncStatus);

    // Update pending count periodically
    const updatePendingCount = async () => {
      const count = await syncService.getPendingSyncCount();
      setPendingCount(count);
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000); // Update every 5 seconds

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSync = () => {
    syncService.syncAll();
  };

  const getStatusIcon = () => {
    if (!isOnline) return <CloudOffIcon className="h-4 w-4" />;
    
    switch (syncStatus.status) {
      case 'syncing':
        return <RotateCwIcon className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircleIcon className="h-4 w-4" />;
      case 'error':
        return <XCircleIcon className="h-4 w-4" />;
      default:
        if (pendingCount > 0) {
          return <ClockIcon className="h-4 w-4" />;
        }
        return <CloudIcon className="h-4 w-4" />;
    }
  };

  const getStatusVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (!isOnline) return "secondary";
    
    switch (syncStatus.status) {
      case 'syncing':
        return "default";
      case 'completed':
        return "secondary";
      case 'error':
        return "destructive";
      default:
        return pendingCount > 0 ? "outline" : "secondary";
    }
  };

  const getStatusText = () => {
    if (!isOnline) return "Offline";
    
    switch (syncStatus.status) {
      case 'syncing':
        return `Syncing... ${Math.round(syncStatus.progress || 0)}%`;
      case 'completed':
        return "Synced";
      case 'error':
        return "Sync Error";
      default:
        if (pendingCount > 0) {
          return `${pendingCount} pending`;
        }
        return "Synced";
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Badge variant={getStatusVariant()} className="cursor-pointer gap-1">
          {getStatusIcon()}
          {getStatusText()}
        </Badge>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sync Status</DialogTitle>
        </DialogHeader>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon()}
              {isOnline ? "Online" : "Offline"}
            </CardTitle>
            <CardDescription>
              {isOnline 
                ? "Your device is connected to the internet" 
                : "Your device is offline. Photos will be stored locally and synced when online."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncStatus.status === 'syncing' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Syncing files...</span>
                  <span>{Math.round(syncStatus.progress || 0)}%</span>
                </div>
                <Progress value={syncStatus.progress || 0} />
              </div>
            )}

            {syncStatus.status === 'error' && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <p className="text-sm text-destructive">
                  {syncStatus.error || "An error occurred during sync"}
                </p>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Pending uploads:</span>
              <Badge variant="outline">{pendingCount}</Badge>
            </div>

            {isOnline && pendingCount > 0 && (
              <Button 
                onClick={handleManualSync} 
                disabled={syncStatus.status === 'syncing'}
                className="w-full"
              >
                {syncStatus.status === 'syncing' ? (
                  <>
                    <RotateCwIcon className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RotateCwIcon className="mr-2 h-4 w-4" />
                    Sync Now
                  </>
                )}
              </Button>
            )}

            {!isOnline && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Files will automatically sync when you're back online.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};