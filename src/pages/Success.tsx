import React, { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import LogoMark from '@/components/LogoMark';

const Success = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { checkSubscription } = useSubscription();

  useEffect(() => {
    // Refresh subscription status after successful payment
    const refreshStatus = async () => {
      // Wait a moment for Stripe to process
    setTimeout(() => {
      checkSubscription();
    }, 3000); // Check subscription after 3 seconds to allow processing time
    };

    if (sessionId) {
      refreshStatus();
    }
  }, [sessionId, checkSubscription]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6">
            <LogoMark 
              className="h-12 w-12 text-primary" 
              title="RunsheetPro" 
            />
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              RunsheetPro
            </h1>
          </Link>
        </div>

        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl text-green-800 dark:text-green-200">
              Payment Successful!
            </CardTitle>
            <CardDescription className="text-green-700 dark:text-green-300">
              Welcome to RunsheetPro! Your subscription is now active.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                You now have full access to:
              </p>
              <ul className="text-sm space-y-1 text-green-700 dark:text-green-300">
                <li>• Unlimited document analysis</li>
                <li>• AI-powered data extraction</li>
                <li>• Advanced runsheet management</li>
                <li>• Cloud storage & sync</li>
                <li>• Voice input support</li>
              </ul>
            </div>

            <div className="space-y-3 pt-4">
              <Link to="/runsheet" className="block">
                <Button className="w-full gap-2">
                  Start Using RunsheetPro
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              
              <Link to="/pricing" className="block">
                <Button variant="outline" className="w-full">
                  Manage Subscription
                </Button>
              </Link>
            </div>

            {sessionId && (
              <div className="text-center pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Session ID: {sessionId.slice(0, 20)}...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Success;