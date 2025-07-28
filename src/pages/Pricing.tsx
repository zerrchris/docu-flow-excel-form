import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowLeft } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from '@/hooks/use-toast';
import extractorLogo from '@/assets/document-extractor-logo.png';

const Pricing = () => {
  const { subscribed, subscriptionTier, createCheckout, manageSubscription, loading } = useSubscription();

  const handlePlanSelect = async (plan: 'daily' | 'weekly' | 'monthly') => {
    try {
      await createCheckout(plan);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start checkout process. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleManageSubscription = async () => {
    try {
      await manageSubscription();
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to open subscription management. Please try again.",
        variant: "destructive"
      });
    }
  };

  const plans = [
    {
      id: 'daily',
      name: 'Daily Access',
      price: '$9.99',
      period: 'per day',
      description: 'Perfect for short-term projects',
      features: [
        'Unlimited document analysis',
        'AI-powered data extraction',
        'Runsheet management',
        'Cloud storage',
        'Voice input support'
      ]
    },
    {
      id: 'weekly', 
      name: 'Weekly Access',
      price: '$29.99',
      period: 'per week',
      description: 'Great for ongoing work',
      popular: true,
      features: [
        'Unlimited document analysis',
        'AI-powered data extraction', 
        'Runsheet management',
        'Cloud storage',
        'Voice input support',
        'Priority support'
      ]
    },
    {
      id: 'monthly',
      name: 'Monthly Access',
      price: '$79.00',
      period: 'per month',
      description: 'Best value for regular users',
      features: [
        'Unlimited document analysis',
        'AI-powered data extraction',
        'Runsheet management', 
        'Cloud storage',
        'Voice input support',
        'Priority support',
        'Advanced analytics'
      ]
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-4">
              <img 
                src={extractorLogo} 
                alt="RunsheetPro Logo" 
                className="h-12 w-12"
              />
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                RunsheetPro
              </h1>
            </Link>
            <Link to="/">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to App
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Get full access to RunsheetPro's powerful document analysis and runsheet management features
          </p>
          
          {subscribed && (
            <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800 max-w-md mx-auto">
              <p className="text-green-800 dark:text-green-200 font-medium">
                Current Plan: {subscriptionTier}
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleManageSubscription}
                className="mt-2"
              >
                Manage Subscription
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : ''}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                  Most Popular
                </Badge>
              )}
              
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground ml-1">{plan.period}</span>
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handlePlanSelect(plan.id as 'daily' | 'weekly' | 'monthly')}
                  disabled={subscribed && subscriptionTier?.toLowerCase().includes(plan.id)}
                >
                  {subscribed && subscriptionTier?.toLowerCase().includes(plan.id) 
                    ? 'Current Plan' 
                    : 'Get Started'
                  }
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-muted-foreground">
            All plans include a 24-hour money-back guarantee
          </p>
        </div>
      </div>
    </div>
  );
};

export default Pricing;