import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertCircle, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BackupData {
  runsheetId: string;
  runsheetName: string;
  columns: string[];
  data: Record<string, string>[];
  columnInstructions: Record<string, string>;
  lastSaved: string;
}

interface DataRecoveryButtonProps {
  onRecover: (data: BackupData) => void;
}

export function DataRecoveryButton({ onRecover }: DataRecoveryButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [backups, setBackups] = useState<BackupData[]>([]);
  const { toast } = useToast();

  const scanForBackups = () => {
    const foundBackups: BackupData[] = [];
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith('runsheet_backup_')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          if (data.runsheetName && data.columns && data.data) {
            foundBackups.push(data);
          }
        } catch (e) {
          console.error('Failed to parse backup:', key, e);
        }
      }
    });
    
    setBackups(foundBackups.sort((a, b) => 
      new Date(b.lastSaved).getTime() - new Date(a.lastSaved).getTime()
    ));
    setShowDialog(true);
  };

  const handleRecover = (backup: BackupData) => {
    onRecover(backup);
    setShowDialog(false);
    toast({
      title: "Data recovered",
      description: `Restored "${backup.runsheetName}" from backup`,
    });
  };

  const clearBackup = (runsheetId: string) => {
    localStorage.removeItem(`runsheet_backup_${runsheetId}`);
    setBackups(prev => prev.filter(b => b.runsheetId !== runsheetId));
    toast({
      title: "Backup cleared",
      description: "Local backup has been removed",
    });
  };

  return (
    <>
      <Button 
        variant="outline" 
        onClick={scanForBackups}
        className="flex items-center gap-2"
      >
        <AlertCircle className="h-4 w-4" />
        Data Recovery
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recover Data from Local Backups</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {backups.length === 0 ? (
              <p className="text-muted-foreground">No local backups found.</p>
            ) : (
              backups.map((backup, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{backup.runsheetName}</h4>
                      <p className="text-sm text-muted-foreground">
                        {backup.columns.length} columns, {backup.data.length} rows
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Saved: {new Date(backup.lastSaved).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleRecover(backup)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => clearBackup(backup.runsheetId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}