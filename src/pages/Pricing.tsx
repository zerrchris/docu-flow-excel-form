import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, ArrowLeft, FileText, Save, FolderOpen, Camera, Mic, Download, Smartphone, Settings, Layers } from 'lucide-react';
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
      description: 'Perfect for short-term projects'
    },
    {
      id: 'weekly', 
      name: 'Weekly Access',
      price: '$29.99',
      period: 'per week',
      description: 'Great for ongoing work',
      popular: true
    },
    {
      id: 'monthly',
      name: 'Monthly Access',
      price: '$79.00',
      period: 'per month',
      description: 'Best value for regular users'
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
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 w-full">
        <div className="max-w-7xl mx-auto px-4 py-4">
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
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Full access to all RunsheetPro features
                  </p>
                </div>
              </CardContent>

               <CardFooter>
                <Button 
                  className="w-full" 
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handlePlanSelect(plan.id as 'daily' | 'weekly' | 'monthly')}
                  disabled={loading || subscribed}
                >
                  {loading 
                    ? 'Loading...'
                    : subscribed 
                      ? (subscriptionTier?.toLowerCase().includes(plan.id) ? 'Current Plan' : 'Already Subscribed')
                      : 'Get Started'
                  }
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Features Section */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold mb-4">
              Everything included with your subscription
            </h3>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            <Card>
              <CardContent className="p-6">
                <FileText className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">AI Document Analysis</h4>
                <p className="text-sm text-muted-foreground">
                  Upload any document and let AI extract key information automatically
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Save className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Cloud Storage</h4>
                <p className="text-sm text-muted-foreground">
                  Secure cloud storage for all your documents and runsheets
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <FolderOpen className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Runsheet Management</h4>
                <p className="text-sm text-muted-foreground">
                  Create, organize, and manage unlimited runsheets
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Camera className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Screenshot Capture</h4>
                <p className="text-sm text-muted-foreground">
                  Capture screenshots directly from web pages and process them
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Mic className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Voice Input</h4>
                <p className="text-sm text-muted-foreground">
                  Voice-to-text transcription for hands-free data entry
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Download className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Export Options</h4>
                <p className="text-sm text-muted-foreground">
                  Export your data to various formats including Excel and PDF
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Smartphone className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Mobile Support</h4>
                <p className="text-sm text-muted-foreground">
                  Full mobile camera integration and responsive interface
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Settings className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Custom Preferences</h4>
                <p className="text-sm text-muted-foreground">
                  Customize extraction preferences and document naming
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <Layers className="h-8 w-8 text-primary mb-4" />
                <h4 className="font-semibold mb-2">Batch Processing</h4>
                <p className="text-sm text-muted-foreground">
                  Process multiple documents at once for efficiency
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

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