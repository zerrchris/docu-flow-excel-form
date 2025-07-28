import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, CreditCard } from 'lucide-react';

interface SubscriptionGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children, fallback }) => {
  const { subscribed, loading } = useSubscription();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!subscribed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
};

export const SubscriptionRequired: React.FC = () => (
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
          <Button className="w-full gap-2" onClick={() => window.location.href = '/pricing'}>
            <CreditCard className="h-4 w-4" />
            View Pricing Plans
          </Button>
          
          <Button variant="outline" className="w-full" onClick={() => window.location.href = '/'}>
            Back to Home
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);

export default SubscriptionGuard;