import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, CreditCard, TrendingUp, AlertCircle } from 'lucide-react';

interface UsageBillingProps {
  userId?: string;
  currentCost?: number;
}

export const UsageBilling: React.FC<UsageBillingProps> = ({ userId, currentCost = 0 }) => {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [hasUsageBilling, setHasUsageBilling] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string>('');
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    checkBillingStatus();
    loadMonthlyUsage();
  }, [userId]);

  const checkBillingStatus = async () => {
    try {
      const { data: subscriber } = await supabase
        .from('subscribers')
        .select('subscription_tier, stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (subscriber?.subscription_tier === 'Usage-Based') {
        setHasUsageBilling(true);
        setBillingStatus('active');
      }
    } catch (error) {
      console.error('Error checking billing status:', error);
    }
  };

  const loadMonthlyUsage = async () => {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('ai_usage_analytics')
        .select('estimated_cost_usd')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString());

      if (data) {
        const total = data.reduce((sum, item) => sum + (item.estimated_cost_usd || 0), 0);
        setMonthlyUsage(total);
      }
    } catch (error) {
      console.error('Error loading monthly usage:', error);
    }
  };

  const setupUsageBilling = async () => {
    setIsSettingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-usage-billing');
      
      if (error) throw error;

      if (data.requires_payment_method) {
        // Redirect to Stripe to add payment method
        const stripe = (window as any).Stripe(process.env.STRIPE_PUBLISHABLE_KEY);
        const { error: stripeError } = await stripe.confirmSetup(data.client_secret);
        
        if (stripeError) throw stripeError;
      }

      setHasUsageBilling(true);
      setBillingStatus('active');
      toast({
        title: "Usage billing activated",
        description: "You'll now be charged automatically based on your AI usage.",
      });
    } catch (error: any) {
      toast({
        title: "Setup failed",
        description: error.message || "Failed to set up usage billing",
        variant: "destructive"
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Usage-Based Billing
              </CardTitle>
              <CardDescription>
                Pay only for what you use with automatic AI cost billing
              </CardDescription>
            </div>
            {hasUsageBilling && (
              <Badge variant="outline" className="bg-green-50">
                <CreditCard className="h-4 w-4 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasUsageBilling ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Enable usage-based billing to automatically charge for AI processing costs.
                  You'll be billed monthly based on your actual usage.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">No Base Fee</div>
                  <div className="text-sm text-muted-foreground">Only pay for usage</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">Transparent</div>
                  <div className="text-sm text-muted-foreground">See exact costs</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">Automatic</div>
                  <div className="text-sm text-muted-foreground">Monthly billing</div>
                </div>
              </div>

              <Button 
                onClick={setupUsageBilling} 
                disabled={isSettingUp}
                className="w-full"
              >
                {isSettingUp ? 'Setting up...' : 'Enable Usage Billing'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      This Month
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCost(monthlyUsage)}</div>
                    <p className="text-xs text-muted-foreground">
                      Total AI usage costs
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Current Session
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatCost(currentCost)}</div>
                    <p className="text-xs text-muted-foreground">
                      Costs since page load
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <AlertDescription>
                  Usage billing is active. You'll be charged monthly for AI processing costs.
                  View detailed usage in the Analytics section.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};