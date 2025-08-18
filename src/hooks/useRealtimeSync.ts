import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { createRealTimeSubscription, connectionMonitor } from '@/utils/dataSync';

interface RealtimeSyncOptions {
  runsheetId?: string | null;
  onUpdate?: (payload: any) => void;
  onError?: (error: any) => void;
  enabled?: boolean;
}

export function useRealtimeSync({ 
  runsheetId, 
  onUpdate,
  onError,
  enabled = true 
}: RealtimeSyncOptions) {
  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastUpdateRef = useRef<string>('');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    console.log('Realtime update received:', payload);
    
    // Avoid processing our own updates
    const updateId = payload.new?.updated_at || payload.old?.updated_at;
    if (updateId && updateId === lastUpdateRef.current) {
      console.log('Skipping own update');
      return;
    }

    // Show notification for updates from other users
    if (payload.eventType === 'UPDATE' && payload.new) {
      toast({
        title: "Runsheet updated",
        description: "Changes were made by another user and have been synchronized.",
        variant: "default",
      });
    }

    onUpdate?.(payload);
  }, [onUpdate, toast]);

  const handleRealtimeError = useCallback((error: any) => {
    console.error('Realtime subscription error:', error);
    onError?.(error);
    
    // Attempt to reconnect after a delay
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (enabled && runsheetId && connectionMonitor.online) {
        console.log('Attempting to reconnect realtime subscription...');
        // The subscription will be recreated by the useEffect
      }
    }, 5000);
  }, [onError, enabled, runsheetId]);

  // Track our own updates to avoid processing them
  const trackOwnUpdate = useCallback((updateTime: string) => {
    lastUpdateRef.current = updateTime;
  }, []);

  useEffect(() => {
    if (!enabled || !runsheetId) {
      // Clean up existing subscription
      if (channelRef.current) {
        // Use custom cleanup if available, otherwise fallback to supabase.removeChannel
        const channel = channelRef.current;
        if ((channel as any)._cleanup) {
          (channel as any)._cleanup();
        } else {
          supabase.removeChannel(channel);
        }
        channelRef.current = null;
      }
      return;
    }

    // Create enhanced subscription with error handling
    const channel = createRealTimeSubscription(
      'runsheets',
      `id=eq.${runsheetId}`,
      handleRealtimeUpdate,
      handleRealtimeError
    );

    channelRef.current = channel;

    // Cleanup function
    return () => {
      if (channelRef.current) {
        const channel = channelRef.current;
        if ((channel as any)._cleanup) {
          (channel as any)._cleanup();
        } else {
          supabase.removeChannel(channel);
        }
        channelRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [runsheetId, enabled, handleRealtimeUpdate, handleRealtimeError]);

  return {
    trackOwnUpdate
  };
}