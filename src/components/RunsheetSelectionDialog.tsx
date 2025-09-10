import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Calendar, Loader2, Search, Plus, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { RunsheetService } from '@/services/runsheetService';

interface Runsheet {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  data: any;
  columns?: string[];
}

interface RunsheetSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunsheetSelected: (runsheet: Runsheet | null, isNew?: boolean) => void;
  title?: string;
  description?: string;
}

const RunsheetSelectionDialog: React.FC<RunsheetSelectionDialogProps> = ({ 
  open, 
  onOpenChange, 
  onRunsheetSelected,
  title = "Select Runsheet for Document",
  description = "Choose a runsheet to organize your document, or create a new one"
}) => {
  const [runsheets, setRunsheets] = useState<Runsheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newRunsheetName, setNewRunsheetName] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      fetchRunsheets();
      setShowCreateNew(false);
      setNewRunsheetName('');
      setSearchQuery('');
    }
  }, [open]);

  const fetchRunsheets = async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('User not authenticated:', authError);
        setRunsheets([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('runsheets')
        .select('id, name, created_at, updated_at, data, columns')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching runsheets:', error);
        setRunsheets([]);
        return;
      }

      setRunsheets(data || []);
    } catch (error) {
      console.error('Error fetching runsheets:', error);
      setRunsheets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRunsheet = (runsheet: Runsheet) => {
    onRunsheetSelected(runsheet);
  };

  const handleCreateNewRunsheet = async () => {
    if (!newRunsheetName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for the new runsheet.",
        variant: "destructive",
      });
      return;
    }

    setCreatingNew(true);
    
    // Use the unified service to create new runsheet
    const success = await RunsheetService.createNewRunsheet(
      { name: newRunsheetName.trim() },
      navigate
    );
    
    if (success) {
      // Close dialog and notify parent
      onRunsheetSelected(null, true); // Signal new runsheet creation
      setShowCreateNew(false);
      setNewRunsheetName('');
      onOpenChange(false);
    }
    
    setCreatingNew(false);
  };

  const handleSkipRunsheet = () => {
    onRunsheetSelected(null);
  };

  // Filter runsheets based on search query
  const filteredRunsheets = runsheets.filter(runsheet =>
    runsheet.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        
        {!showCreateNew ? (
          <>
            {/* Search Field */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search runsheets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading runsheets...</span>
                </div>
              ) : filteredRunsheets.length === 0 && searchQuery ? (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No runsheets found</h3>
                  <p className="text-muted-foreground">
                    No runsheets match your search for "{searchQuery}". Try a different search term.
                  </p>
                </div>
              ) : filteredRunsheets.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No runsheets found</h3>
                  <p className="text-muted-foreground">
                    You haven't created any runsheets yet. Create your first runsheet to organize your documents.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredRunsheets.map((runsheet) => (
                    <Card 
                      key={runsheet.id} 
                      className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-primary/30"
                      onClick={() => handleSelectRunsheet(runsheet)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <FileText className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{runsheet.name}</CardTitle>
                              <CardDescription className="flex items-center gap-1 text-xs">
                                <Calendar className="h-3 w-3" />
                                Last updated: {format(new Date(runsheet.updated_at), 'MMM d, yyyy')}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              {Array.isArray(runsheet.data) ? runsheet.data.length : 0} rows
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-between gap-2 pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleSkipRunsheet}>
                  Skip (No Runsheet)
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </div>
              <Button onClick={() => setShowCreateNew(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create New Runsheet
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Create New Runsheet Form */}
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="runsheet-name">Runsheet Name</Label>
                <Input
                  id="runsheet-name"
                  placeholder="Enter runsheet name (e.g., Property Survey Documents, Client Files)"
                  value={newRunsheetName}
                  onChange={(e) => setNewRunsheetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateNewRunsheet();
                    }
                  }}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                This runsheet will be created with default columns: Document Name, Date, and Notes. You can customize the columns later.
              </div>
            </div>

            <DialogFooter className="flex justify-between gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCreateNew(false)}>
                Back to Selection
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleSkipRunsheet}>
                  Skip (No Runsheet)
                </Button>
                <Button 
                  onClick={handleCreateNewRunsheet}
                  disabled={creatingNew || !newRunsheetName.trim()}
                  className="gap-2"
                >
                  {creatingNew ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Create Runsheet
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RunsheetSelectionDialog;