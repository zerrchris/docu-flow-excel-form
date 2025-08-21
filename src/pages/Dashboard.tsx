import React, { useState, useEffect } from 'react';
import SubscriptionGuard, { SubscriptionRequired } from '@/components/SubscriptionGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileText, Camera, FolderOpen, Upload, Users, Settings, Plus, Cloud, Columns, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import LogoMark from '@/components/LogoMark';
import AuthButton from '@/components/AuthButton';
import { toast } from '@/hooks/use-toast';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';

import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import OpenRunsheetDialog from '@/components/OpenRunsheetDialog';
import ColumnPreferencesDialog from '@/components/ColumnPreferencesDialog';

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showColumnPreferences, setShowColumnPreferences] = useState(false);
  const [showNameNewRunsheetDialog, setShowNameNewRunsheetDialog] = useState(false);
  const [newRunsheetName, setNewRunsheetName] = useState('');
  const navigate = useNavigate();
  const { activeRunsheet, clearActiveRunsheet } = useActiveRunsheet();
  const [isValidatingRunsheet, setIsValidatingRunsheet] = useState(false);

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

  // Validate active runsheet exists in database
  useEffect(() => {
    const validateActiveRunsheet = async () => {
      if (!activeRunsheet || !user || isValidatingRunsheet) return;
      
      setIsValidatingRunsheet(true);
      try {
        const { data, error } = await supabase
          .from('runsheets')
          .select('id')
          .eq('id', activeRunsheet.id)
          .eq('user_id', user.id)
          .maybeSingle();
          
        // If runsheet doesn't exist in database, clear it from localStorage
        if (!data) {
          console.log('🧹 Active runsheet no longer exists in database, clearing localStorage');
          clearActiveRunsheet();
          toast({
            title: "Runsheet cleared",
            description: "Your active runsheet was no longer available and has been cleared.",
            variant: "default"
          });
        }
      } catch (error) {
        console.error('Error validating active runsheet:', error);
      } finally {
        setIsValidatingRunsheet(false);
      }
    };

    validateActiveRunsheet();
  }, [activeRunsheet, user, clearActiveRunsheet, isValidatingRunsheet]);

  const handleCreateNewRunsheet = async () => {
    if (!newRunsheetName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your runsheet.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Use the same default columns as DocumentProcessor
      const DEFAULT_COLUMNS = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'];
      
      // Get user preferences for initial columns  
      const preferences = await ExtractionPreferencesService.getDefaultPreferences();
      const initialColumns = preferences?.columns || DEFAULT_COLUMNS;

      const finalName = newRunsheetName.trim();
      
      // Navigate to runsheet and trigger the same new runsheet creation as the + button
      navigate('/runsheet');
      
      // Small delay to ensure navigation completes, then trigger the same event as the + button
      setTimeout(() => {
        // Dispatch the same event that the + button's "Start New Runsheet" option triggers
        const event = new CustomEvent('createNewRunsheetFromDashboard', {
          detail: {
            name: finalName,
            columns: initialColumns,
            instructions: preferences?.column_instructions || {}
          }
        });
        window.dispatchEvent(event);
      }, 100);
      
      setShowNameNewRunsheetDialog(false);
      setNewRunsheetName('');
      
    } catch (error) {
      console.error('Error creating new runsheet:', error);
      toast({
        title: "Error", 
        description: "Failed to create new runsheet. Please try again.",
        variant: "destructive"
      });
    }
  };

  const workflowOptions = [
    {
      title: "New Runsheet",
      description: "Start with a blank runsheet",
      icon: Plus,
      action: "new-runsheet"
    },
    {
      title: "Open Runsheet",
      description: "Load a previously saved runsheet",
      icon: FolderOpen,
      action: "open-dialog"
    },
    {
      title: "Lease Check Analyzer",
      description: "Analyze oil and gas runsheet documents for lease status and mineral ownership",
      icon: Search,
      path: "/lease-check"
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
    },
    {
      title: "Column Preferences",
      description: "Customize your default columns for new runsheets",
      icon: Columns,
      action: "column-preferences"
    }
  ];

  return (
    <SubscriptionGuard fallback={<SubscriptionRequired />}>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b w-full">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-4">
              <LogoMark 
                className="h-12 w-12 text-primary" 
                title="RunsheetPro" 
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
                  } else if (option.action === "column-preferences") {
                    setShowColumnPreferences(true);
                  } else if (option.action === "new-runsheet") {
                    setShowNameNewRunsheetDialog(true);
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
                        } else if (option.action === "column-preferences") {
                          setShowColumnPreferences(true);
                        } else if (option.action === "new-runsheet") {
                          setShowNameNewRunsheetDialog(true);
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
      
      {/* Column Preferences Dialog */}
      <ColumnPreferencesDialog 
        open={showColumnPreferences} 
        onOpenChange={setShowColumnPreferences} 
      />

      {/* Name New Runsheet Dialog */}
      <Dialog open={showNameNewRunsheetDialog} onOpenChange={setShowNameNewRunsheetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Name Your Runsheet</DialogTitle>
            <DialogDescription>
              Choose a descriptive name for your new runsheet. This will help you identify it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Enter runsheet name..."
              value={newRunsheetName}
              onChange={(e) => setNewRunsheetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newRunsheetName.trim()) {
                  handleCreateNewRunsheet();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNameNewRunsheetDialog(false);
                setNewRunsheetName('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateNewRunsheet}
              disabled={!newRunsheetName.trim()}
            >
              Create Runsheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </SubscriptionGuard>
  );
};

export default Dashboard;