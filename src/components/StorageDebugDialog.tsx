import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw, FolderOpen } from 'lucide-react';
import { StorageDebugService } from '@/services/storageDebugService';
import { useToast } from '@/hooks/use-toast';

interface StorageDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runsheetId?: string;
}

export const StorageDebugDialog: React.FC<StorageDebugDialogProps> = ({
  open,
  onOpenChange,
  runsheetId
}) => {
  const [files, setFiles] = useState<any[]>([]);
  const [orphanedFiles, setOrphanedFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'runsheet' | 'all' | 'orphaned'>('runsheet');
  const { toast } = useToast();

  const loadFiles = async () => {
    setLoading(true);
    try {
      if (activeTab === 'runsheet' && runsheetId) {
        const { files: runsheetFiles, error } = await StorageDebugService.listRunsheetFiles(runsheetId);
        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          setFiles(runsheetFiles);
        }
      } else if (activeTab === 'all') {
        const { files: allFiles, error } = await StorageDebugService.listUserFiles();
        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          setFiles(allFiles);
        }
      } else if (activeTab === 'orphaned') {
        const { orphaned, error } = await StorageDebugService.findOrphanedFiles();
        if (error) {
          toast({ title: "Error", description: error, variant: "destructive" });
        } else {
          setOrphanedFiles(orphaned);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const cleanupOrphaned = async () => {
    setLoading(true);
    try {
      const { cleaned, error } = await StorageDebugService.cleanupOrphanedFiles();
      if (error) {
        toast({ title: "Error", description: error, variant: "destructive" });
      } else {
        toast({ 
          title: "Cleanup Complete", 
          description: `Cleaned up ${cleaned} orphaned files` 
        });
        loadFiles(); // Refresh the list
      }
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      loadFiles();
    }
  }, [open, activeTab, runsheetId]);

  const displayFiles = activeTab === 'orphaned' ? orphanedFiles : files;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Storage Debug Tool</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Tab Navigation */}
          <div className="flex space-x-2">
            {runsheetId && (
              <Button
                variant={activeTab === 'runsheet' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('runsheet')}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Current Runsheet
              </Button>
            )}
            <Button
              variant={activeTab === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('all')}
            >
              All Files
            </Button>
            <Button
              variant={activeTab === 'orphaned' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('orphaned')}
            >
              Orphaned Files
              {orphanedFiles.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {orphanedFiles.length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadFiles}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {activeTab === 'orphaned' && orphanedFiles.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={cleanupOrphaned}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Cleanup Orphaned ({orphanedFiles.length})
              </Button>
            )}
          </div>

          {/* File List */}
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {displayFiles.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  {loading ? 'Loading...' : 'No files found'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">File Name</th>
                      <th className="text-left p-2">Location</th>
                      <th className="text-left p-2">Size</th>
                      <th className="text-left p-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayFiles.map((file, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2 font-mono text-xs">{file.name}</td>
                        <td className="p-2">
                          {file.location && (
                            <Badge variant="outline" className="text-xs">
                              {file.location === 'root' ? 'Root' : `Runsheet: ${file.location.slice(0, 8)}...`}
                            </Badge>
                          )}
                        </td>
                        <td className="p-2">{file.metadata?.size ? `${(file.metadata.size / 1024).toFixed(1)} KB` : '-'}</td>
                        <td className="p-2">{file.created_at ? new Date(file.created_at).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="text-sm text-muted-foreground">
            Total files shown: {displayFiles.length}
            {activeTab === 'orphaned' && orphanedFiles.length > 0 && (
              <span className="text-destructive ml-2">
                • {orphanedFiles.length} orphaned files taking up unnecessary space
              </span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};