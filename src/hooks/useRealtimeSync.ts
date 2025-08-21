import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

interface RealtimeSyncOptions {
  runsheetId?: string | null;
  onUpdate?: (payload: any) => void;
  enabled?: boolean;
}

export function useRealtimeSync({ 
  runsheetId, 
  onUpdate,
  enabled = true 
}: RealtimeSyncOptions) {
  const { toast } = useToast();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastUpdateRef = useRef<string>('');

  const handleRealtimeUpdate = useCallback((payload: any) => {
    console.log('📊 Skipping real-time update - no data changes detected');
    
    // Skip all real-time updates to prevent interference with user edits
    // Real-time sync is disabled to prevent data conflicts and ensure user data integrity
    return;
    
    // The below code is commented out to prevent real-time interference
    /*
    console.log('Realtime update received:', payload);
    
    // Avoid processing our own updates
    const updateId = payload.new?.updated_at || payload.old?.updated_at;
    if (updateId && updateId === lastUpdateRef.current) {
      console.log('Skipping own update');
      return;
    }

    // Only show notifications for updates from other users
    if (payload.eventType === 'UPDATE' && payload.new) {
      toast({
        title: "Runsheet updated",
        description: "Changes were made by another user and have been synchronized.",
        variant: "default",
      });
    }

    onUpdate?.(payload);
    */
  }, []);

  // Track our own updates to avoid processing them
  const trackOwnUpdate = useCallback((updateTime: string) => {
    lastUpdateRef.current = updateTime;
  }, []);

  useEffect(() => {
    if (!enabled || !runsheetId) {
      // Clean up existing subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Create new subscription
    const channel = supabase
      .channel(`runsheet_${runsheetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'runsheets',
          filter: `id=eq.${runsheetId}`
        },
        handleRealtimeUpdate
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [runsheetId, enabled, handleRealtimeUpdate]);

  return {
    trackOwnUpdate
  };
}