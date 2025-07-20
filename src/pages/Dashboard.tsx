import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Camera, FolderOpen, Upload, Users, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import extractorLogo from '@/assets/document-extractor-logo.png';
import AuthButton from '@/components/AuthButton';

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => subscription.unsubscribe();
    };

    initAuth();
  }, []);

  const workflowOptions = [
    {
      title: "Start a Runsheet",
      description: "Begin processing documents and extracting data",
      icon: FileText,
      path: "/runsheet",
      primary: true
    },
    {
      title: "Mobile Camera",
      description: "Capture documents on the go with your mobile device",
      icon: Camera,
      path: "/mobile-capture"
    },
    {
      title: "Manage Files",
      description: "Organize and manage your uploaded documents",
      icon: FolderOpen,
      path: "/file-manager"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
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
            <div className="flex items-center gap-4">
              <AuthButton />
              {user && (
                <Link to="/admin">
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Admin
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Welcome to RunsheetPro
            </h2>
            <p className="text-xl text-muted-foreground">
              Choose your workflow to get started with document processing
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {workflowOptions.map((option) => (
              <Card 
                key={option.path} 
                className={`hover:shadow-lg transition-shadow cursor-pointer ${
                  option.primary ? 'ring-2 ring-primary/20' : ''
                }`}
                onClick={() => navigate(option.path)}
              >
                <CardHeader className="text-center">
                  <option.icon className={`h-12 w-12 mx-auto mb-4 ${
                    option.primary ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                  <CardTitle className="text-xl">{option.title}</CardTitle>
                  <CardDescription className="text-base">
                    {option.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    className="w-full" 
                    variant={option.primary ? "default" : "outline"}
                  >
                    {option.primary ? "Get Started" : "Open"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Stats or Recent Activity could go here */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Need help? Check out our documentation or contact support.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;