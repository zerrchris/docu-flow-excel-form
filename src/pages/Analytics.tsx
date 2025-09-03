import React from 'react';
import SubscriptionGuard, { SubscriptionRequired } from '@/components/SubscriptionGuard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import LogoMark from '@/components/LogoMark';
import AuthButton from '@/components/AuthButton';
import { AIUsageAnalytics } from '@/components/AIUsageAnalytics';

const Analytics: React.FC = () => {
  return (
    <SubscriptionGuard fallback={<SubscriptionRequired />}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b w-full">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link to="/app" className="flex items-center gap-4">
                <LogoMark 
                  className="h-12 w-12 text-primary" 
                  title="RunsheetPro" 
                />
                <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  RunsheetPro
                </h1>
              </Link>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <Link to="/app" className="flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                  </Link>
                </Button>
                <AuthButton />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <AIUsageAnalytics />
        </main>
      </div>
    </SubscriptionGuard>
  );
};

export default Analytics;