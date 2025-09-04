import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AIUsageCostTrackerProps {
  className?: string;
}

export const AIUsageCostTracker: React.FC<AIUsageCostTrackerProps> = ({ className }) => {
  const [sessionCost, setSessionCost] = useState(0);
  const [todayCost, setTodayCost] = useState(0);
  const [monthCost, setMonthCost] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsageCosts();
    
    // Set up real-time subscription for new usage
    const subscription = supabase
      .channel('ai_usage_realtime')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'ai_usage_analytics',
          filter: `user_id=eq.${getCurrentUserId()}`
        }, 
        (payload) => {
          const newCost = payload.new.estimated_cost_usd || 0;
          setSessionCost(prev => prev + newCost);
          setTodayCost(prev => prev + newCost);
          setMonthCost(prev => prev + newCost);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const getCurrentUserId = () => {
    // This should be replaced with actual user ID from auth context
    return supabase.auth.getUser().then(({ data }) => data.user?.id);
  };

  const loadUsageCosts = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get today's costs
      const { data: todayData } = await supabase
        .from('ai_usage_analytics')
        .select('estimated_cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', startOfDay.toISOString());

      // Get this month's costs
      const { data: monthData } = await supabase
        .from('ai_usage_analytics')
        .select('estimated_cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString());

      if (todayData) {
        const todayTotal = todayData.reduce((sum, item) => sum + (item.estimated_cost_usd || 0), 0);
        setTodayCost(todayTotal);
        
        // Session cost is just what we've accumulated since component mount
        // This will be updated by real-time subscription
      }

      if (monthData) {
        const monthTotal = monthData.reduce((sum, item) => sum + (item.estimated_cost_usd || 0), 0);
        setMonthCost(monthTotal);
      }

    } catch (error) {
      console.error('Error loading usage costs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-3/4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          AI Usage Costs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-green-600">{formatCost(sessionCost)}</div>
            <div className="text-xs text-muted-foreground">Session</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-600">{formatCost(todayCost)}</div>
            <div className="text-xs text-muted-foreground">Today</div>
          </div>
          <div>
            <div className="text-lg font-bold text-purple-600">{formatCost(monthCost)}</div>
            <div className="text-xs text-muted-foreground">Month</div>
          </div>
        </div>
        
        {monthCost > 10 && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded-lg">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">High usage this month</span>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground text-center">
          Costs are billed automatically monthly
        </div>
      </CardContent>
    </Card>
  );
};