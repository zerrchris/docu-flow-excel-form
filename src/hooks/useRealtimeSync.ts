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
  const connectionListenerRef = useRef<(() => void) | null>(null);
  const isActiveRef = useRef(true);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    if (!isActiveRef.current) return;
    
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
    if (!isActiveRef.current) return;
    
    console.error('Realtime subscription error:', error);
    onError?.(error);
  }, [onError]);

  const createSubscription = useCallback(() => {
    if (!isActiveRef.current || !enabled || !runsheetId || !connectionMonitor.online) {
      return;
    }

    // Clean up existing subscription
    if (channelRef.current) {
      const channel = channelRef.current;
      if ((channel as any)._cleanup) {
        (channel as any)._cleanup();
      } else {
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
    }

    console.log('Creating new realtime subscription for runsheet:', runsheetId);

    // Create new subscription
    const channel = createRealTimeSubscription(
      'runsheets',
      `id=eq.${runsheetId}`,
      handleRealtimeUpdate,
      handleRealtimeError
    );

    channelRef.current = channel;
  }, [runsheetId, enabled, handleRealtimeUpdate, handleRealtimeError]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (isActiveRef.current && enabled && runsheetId && connectionMonitor.online) {
        console.log('Attempting to reconnect realtime subscription...');
        createSubscription();
      }
    }, 3000); // 3 second delay for reconnection
  }, [createSubscription, enabled, runsheetId]);

  // Track our own updates to avoid processing them
  const trackOwnUpdate = useCallback((updateTime: string) => {
    lastUpdateRef.current = updateTime;
  }, []);

  useEffect(() => {
    isActiveRef.current = true;

    if (!enabled || !runsheetId) {
      // Clean up existing subscription
      if (channelRef.current) {
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

    // Initial subscription creation
    createSubscription();

    // Listen for connection changes
    if (connectionListenerRef.current) {
      connectionListenerRef.current();
    }
    
    connectionListenerRef.current = connectionMonitor.onStatusChange((isOnline) => {
      if (!isActiveRef.current) return;
      
      if (isOnline) {
        console.log('Connection restored - recreating realtime subscription');
        // Small delay to ensure connection is stable
        setTimeout(() => {
          if (isActiveRef.current && enabled && runsheetId) {
            createSubscription();
          }
        }, 1000);
      } else {
        console.log('Connection lost - realtime subscription will be recreated when online');
      }
    });

    // Cleanup function
    return () => {
      isActiveRef.current = false;
      
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
      
      if (connectionListenerRef.current) {
        connectionListenerRef.current();
        connectionListenerRef.current = null;
      }
    };
  }, [runsheetId, enabled, createSubscription]);

  return {
    trackOwnUpdate
  };
}