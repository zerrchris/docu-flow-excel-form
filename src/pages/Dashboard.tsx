import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Camera, FolderOpen, Upload, Users, Settings, Plus, Cloud } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import extractorLogo from '@/assets/document-extractor-logo.png';
import AuthButton from '@/components/AuthButton';

import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import OpenRunsheetDialog from '@/components/OpenRunsheetDialog';

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const navigate = useNavigate();
  const { activeRunsheet } = useActiveRunsheet();

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
      title: "New Runsheet",
      description: "Start with a blank runsheet",
      icon: Plus,
      path: "/runsheet"
    },
    {
      title: "Open Runsheet",
      description: "Load a previously saved runsheet",
      icon: FolderOpen,
      action: "open-dialog"
    },
    {
      title: "Upload Runsheet",
      description: "Upload files from your device",
      icon: Upload,
      path: "/runsheet?action=upload"
    },
    {
      title: "Google Drive",
      description: "Import from Google Drive",
      icon: Cloud,
      path: "/runsheet?action=google-drive"
    },
    {
      title: "Manage Files",
      description: "Organize and manage your uploaded documents",
      icon: FileText,
      path: "/file-manager"
    },
    {
      title: "Mobile Camera",
      description: "Capture documents on the go with your mobile device",
      icon: Camera,
      path: "/mobile-capture"
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

          {/* Continue Working Section */}
          {activeRunsheet && (
            <div className="mb-8 animate-fade-in">
              <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20 hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-foreground">Continue Working</CardTitle>
                        <CardDescription>
                          Pick up where you left off on your active runsheet
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span>Active</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-primary/10 rounded">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{activeRunsheet.name}</p>
                        <p className="text-sm text-muted-foreground">Your active runsheet</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => navigate('/runsheet', { state: { runsheet: activeRunsheet } })}
                      className="hover-scale"
                    >
                      Continue Working
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 max-w-2xl mx-auto">
            {workflowOptions.map((option) => (
              <Card 
                key={option.title} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => {
                  if (option.action === "open-dialog") {
                    setShowOpenDialog(true);
                  } else if (option.path) {
                    navigate(option.path);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <option.icon className="h-8 w-8 text-muted-foreground" />
                    <div className="flex-1">
                      <CardTitle className="text-lg">{option.title}</CardTitle>
                      <CardDescription className="text-sm">
                        {option.description}
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (option.action === "open-dialog") {
                          setShowOpenDialog(true);
                        } else if (option.path) {
                          navigate(option.path);
                        }
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </CardHeader>
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

      {/* Open Runsheet Dialog */}
      <OpenRunsheetDialog 
        open={showOpenDialog} 
        onOpenChange={setShowOpenDialog} 
      />
    </div>
  );
};

export default Dashboard;