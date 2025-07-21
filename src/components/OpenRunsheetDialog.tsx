import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

interface Runsheet {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  data: any;
}

interface OpenRunsheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OpenRunsheetDialog: React.FC<OpenRunsheetDialogProps> = ({ open, onOpenChange }) => {
  const [runsheets, setRunsheets] = useState<Runsheet[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      fetchRunsheets();
    }
  }, [open]);

  const fetchRunsheets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('runsheets')
        .select('id, name, created_at, updated_at, data')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching runsheets:', error);
        return;
      }

      setRunsheets(data || []);
    } catch (error) {
      console.error('Error fetching runsheets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRunsheet = (runsheet: Runsheet) => {
    // Navigate to runsheet page with the selected runsheet
    navigate('/runsheet', { state: { runsheet } });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Open Runsheet
          </DialogTitle>
          <DialogDescription>
            Choose from your saved runsheets to continue working
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading runsheets...</span>
            </div>
          ) : runsheets.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No runsheets found</h3>
              <p className="text-muted-foreground">
                You haven't created any runsheets yet. Start by creating a new runsheet.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {runsheets.map((runsheet) => (
                <Card 
                  key={runsheet.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
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

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => {
            navigate('/runsheet');
            onOpenChange(false);
          }}>
            Create New Instead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OpenRunsheetDialog;