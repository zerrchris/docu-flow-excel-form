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
  const isCreatingSubscriptionRef = useRef(false);
  const lastSubscriptionTimeRef = useRef(0);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    if (!isActiveRef.current) return;
    
    // Avoid processing our own updates
    const updateId = payload.new?.updated_at || payload.old?.updated_at;
    if (updateId && updateId === lastUpdateRef.current) {
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
    onError?.(error);
  }, [onError]);

  const createSubscription = useCallback(() => {
    const now = Date.now();
    
    // Prevent creating subscriptions too frequently (max once per 2 seconds)
    if (now - lastSubscriptionTimeRef.current < 2000) {
      return;
    }
    
    if (!isActiveRef.current || !enabled || !runsheetId || !connectionMonitor.online || isCreatingSubscriptionRef.current) {
      return;
    }

    isCreatingSubscriptionRef.current = true;
    lastSubscriptionTimeRef.current = now;

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

    // Create new subscription
    const channel = createRealTimeSubscription(
      'runsheets',
      `id=eq.${runsheetId}`,
      handleRealtimeUpdate,
      handleRealtimeError
    );

    channelRef.current = channel;
    isCreatingSubscriptionRef.current = false;
  }, [runsheetId, enabled, handleRealtimeUpdate, handleRealtimeError]);

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

    // Initial subscription creation with delay to prevent rapid creation
    const initialTimeout = setTimeout(() => {
      if (isActiveRef.current) {
        createSubscription();
      }
    }, 500);

    // Listen for connection changes (debounced)
    if (connectionListenerRef.current) {
      connectionListenerRef.current();
    }
    
    let connectionTimeout: NodeJS.Timeout | null = null;
    
    connectionListenerRef.current = connectionMonitor.onStatusChange((isOnline) => {
      if (!isActiveRef.current) return;
      
      // Clear any pending timeout
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      
      if (isOnline) {
        // Debounce connection restore to prevent rapid reconnections
        connectionTimeout = setTimeout(() => {
          if (isActiveRef.current && enabled && runsheetId) {
            createSubscription();
          }
        }, 2000); // 2 second delay
      }
    });

    // Cleanup function
    return () => {
      isActiveRef.current = false;
      
      if (initialTimeout) {
        clearTimeout(initialTimeout);
      }
      
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      
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