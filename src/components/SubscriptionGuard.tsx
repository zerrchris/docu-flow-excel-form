import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, CreditCard } from 'lucide-react';

interface SubscriptionGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children, fallback }) => {
  const { subscribed, loading } = useSubscription();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // If there's an error or no session, clear auth and sign out
        if (error || !session) {
          console.error('Auth session error:', error);
          await supabase.auth.signOut();
          setUser(null);
        } else {
          setUser(session.user);
        }
      } catch (error) {
        console.error('Failed to check auth:', error);
        await supabase.auth.signOut();
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (!session) {
        setAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user is not authenticated, redirect to signin
  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  // If user is authenticated but not subscribed, show subscription requirement
  if (!subscribed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
};

export const SubscriptionRequired: React.FC = () => {
  const navigate = useNavigate();
  
  return (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center">
          <Lock className="h-8 w-8 text-orange-600 dark:text-orange-400" />
        </div>
        <CardTitle className="text-2xl">Subscription Required</CardTitle>
        <CardDescription>
          You need an active subscription to access RunsheetPro features.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Subscribe to unlock:
          </p>
          <ul className="text-sm space-y-1">
            <li>• Unlimited document analysis</li>
            <li>• AI-powered data extraction</li>
            <li>• Advanced runsheet management</li>
            <li>• Cloud storage & sync</li>
          </ul>
        </div>

        <div className="space-y-3 pt-4">
          <Button className="w-full gap-2" onClick={() => navigate('/pricing')}>
            <CreditCard className="h-4 w-4" />
            View Pricing Plans
          </Button>
          
          <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
  );
};

export default SubscriptionGuard;