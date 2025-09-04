import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionContextType {
  subscribed: boolean;
  subscriptionTier: string | null;
  subscriptionEnd: string | null;
  loading: boolean;
  checkSubscription: () => Promise<void>;
  createCheckout: (plan: 'daily' | 'weekly' | 'monthly') => Promise<void>;
  manageSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        setSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
      } else {
        setSubscribed(data.subscribed || false);
        setSubscriptionTier(data.subscription_tier || null);
        setSubscriptionEnd(data.subscription_end || null);
      }
    } catch (error) {
      console.error('Error in checkSubscription:', error);
      setSubscribed(false);
      setSubscriptionTier(null);
      setSubscriptionEnd(null);
    } finally {
      setLoading(false);
    }
  };

  const createCheckout = async (plan: 'daily' | 'weekly' | 'monthly') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // First, set up usage billing automatically
      const { error: usageError } = await supabase.functions.invoke('create-usage-billing', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (usageError) {
        console.warn('Failed to set up usage billing:', usageError);
        // Continue with checkout even if usage billing setup fails
      }

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      // Open Stripe checkout in a new tab
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error creating checkout:', error);
      throw error;
    }
  };

  const manageSubscription = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      // Open customer portal in a new tab
      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error opening customer portal:', error);
      throw error;
    }
  };

  // Handle extension session transfer and check subscription on auth state change
  useEffect(() => {
    const handleExtensionAuth = async () => {
      // Check if there's an extension session to transfer
      const urlParams = new URLSearchParams(window.location.search);
      const extensionAuth = urlParams.get('extension_auth');
      
      if (extensionAuth) {
        try {
          // Extension is trying to pass auth data
          const authData = JSON.parse(decodeURIComponent(extensionAuth));
          
          if (authData.access_token && authData.refresh_token) {
            // Set the session in Supabase
            const { error } = await supabase.auth.setSession({
              access_token: authData.access_token,
              refresh_token: authData.refresh_token
            });
            
            if (error) {
              console.error('Failed to set extension session:', error);
            } else {
              console.log('Extension session transferred successfully');
              // Clean up URL parameter
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.delete('extension_auth');
              window.history.replaceState({}, '', newUrl.toString());
            }
          }
        } catch (error) {
          console.error('Failed to parse extension auth data:', error);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkSubscription();
      } else if (event === 'SIGNED_OUT') {
        setSubscribed(false);
        setSubscriptionTier(null);
        setSubscriptionEnd(null);
        setLoading(false);
      }
    });

    // Handle extension auth first, then check initial session
    handleExtensionAuth().then(() => {
      checkSubscription();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-refresh subscription status every 5 minutes instead of 30 seconds
  useEffect(() => {
    const interval = setInterval(checkSubscription, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      subscribed,
      subscriptionTier,
      subscriptionEnd,
      loading,
      checkSubscription,
      createCheckout,
      manageSubscription,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};