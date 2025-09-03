import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Zap, Clock, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UsageData {
  function_name: string;
  model_used: string;
  usage_date: string;
  request_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_estimated_cost: number;
  avg_cost_per_request: number;
}

interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgCostPerRequest: number;
  mostUsedFunction: string;
  mostUsedModel: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export const AIUsageAnalytics: React.FC = () => {
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'all'>('week');
  const { toast } = useToast();

  useEffect(() => {
    loadUsageData();
  }, [dateRange]);

  const loadUsageData = async () => {
    try {
      setLoading(true);
      
      // Calculate date filter
      let dateFilter = '';
      const now = new Date();
      
      if (dateRange === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFilter = `and created_at >= '${weekAgo.toISOString()}'`;
      } else if (dateRange === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter = `and created_at >= '${monthAgo.toISOString()}'`;
      }

      // Fetch usage summary data
      const { data, error } = await supabase
        .from('ai_usage_summary')
        .select('*')
        .order('usage_date', { ascending: false });

      if (error) throw error;

      const filteredData = data || [];
      setUsageData(filteredData);

      // Calculate summary statistics
      if (filteredData.length > 0) {
        const totalRequests = filteredData.reduce((sum, item) => sum + item.request_count, 0);
        const totalTokens = filteredData.reduce((sum, item) => sum + item.total_tokens, 0);
        const totalCost = filteredData.reduce((sum, item) => sum + item.total_estimated_cost, 0);
        
        // Find most used function and model
        const functionCounts = filteredData.reduce((acc, item) => {
          acc[item.function_name] = (acc[item.function_name] || 0) + item.request_count;
          return acc;
        }, {} as Record<string, number>);
        
        const modelCounts = filteredData.reduce((acc, item) => {
          acc[item.model_used] = (acc[item.model_used] || 0) + item.request_count;
          return acc;
        }, {} as Record<string, number>);

        const mostUsedFunction = Object.keys(functionCounts).reduce((a, b) => 
          functionCounts[a] > functionCounts[b] ? a : b
        );
        
        const mostUsedModel = Object.keys(modelCounts).reduce((a, b) => 
          modelCounts[a] > modelCounts[b] ? a : b
        );

        setSummary({
          totalRequests,
          totalTokens,
          totalCost,
          avgCostPerRequest: totalCost / totalRequests,
          mostUsedFunction,
          mostUsedModel
        });
      }

    } catch (error: any) {
      console.error('Error loading usage data:', error);
      toast({
        title: "Error loading analytics",
        description: error.message || "Failed to load AI usage analytics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  // Prepare chart data
  const dailyUsageChart = usageData.slice(0, 14).reverse().map(item => ({
    date: new Date(item.usage_date).toLocaleDateString(),
    requests: item.request_count,
    cost: item.total_estimated_cost,
    tokens: item.total_tokens
  }));

  const functionUsageChart = usageData.reduce((acc, item) => {
    const existing = acc.find(x => x.name === item.function_name);
    if (existing) {
      existing.value += item.request_count;
      existing.cost += item.total_estimated_cost;
    } else {
      acc.push({
        name: item.function_name.replace('analyze-', '').replace('-', ' '),
        value: item.request_count,
        cost: item.total_estimated_cost
      });
    }
    return acc;
  }, [] as Array<{ name: string; value: number; cost: number }>);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">AI Usage Analytics</h2>
        <div className="flex gap-2">
          <Button
            variant={dateRange === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('week')}
          >
            Week
          </Button>
          <Button
            variant={dateRange === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('month')}
          >
            Month
          </Button>
          <Button
            variant={dateRange === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateRange('all')}
          >
            All Time
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalRequests.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCost(summary.totalCost)}</div>
              <p className="text-xs text-muted-foreground">
                Avg: {formatCost(summary.avgCostPerRequest)} per request
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalTokens.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Most Used</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold">{summary.mostUsedFunction.replace('analyze-', '').replace('-', ' ')}</div>
              <Badge variant="secondary" className="text-xs">{summary.mostUsedModel}</Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <Tabs defaultValue="daily" className="space-y-4">
        <TabsList>
          <TabsTrigger value="daily">Daily Usage</TabsTrigger>
          <TabsTrigger value="functions">By Function</TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily AI Requests & Costs</CardTitle>
              <CardDescription>Track your AI usage patterns over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyUsageChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip 
                    formatter={(value, name) => [
                      name === 'cost' ? formatCost(Number(value)) : value,
                      name === 'requests' ? 'Requests' : name === 'cost' ? 'Cost' : 'Tokens'
                    ]}
                  />
                  <Bar yAxisId="left" dataKey="requests" fill="#0088FE" name="requests" />
                  <Bar yAxisId="right" dataKey="cost" fill="#00C49F" name="cost" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="functions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Usage by Function</CardTitle>
              <CardDescription>See which AI functions you use most</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={functionUsageChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {functionUsageChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, 'Requests']} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Function Costs</CardTitle>
              <CardDescription>Cost breakdown by AI function</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {functionUsageChart.map((item, index) => (
                  <div key={item.name} className="flex justify-between items-center">
                    <span className="text-sm font-medium">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.value} requests</Badge>
                      <span className="text-sm">{formatCost(item.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {usageData.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-muted-foreground">No AI usage data available yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Data will appear here after you start using AI features.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};