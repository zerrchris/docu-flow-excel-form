import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, Database } from 'lucide-react';

interface DataRecoveryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUseBackup: () => void;
  onKeepCurrent: () => void;
  backupData: {
    lastSaved: string;
    dataRows: number;
  };
  currentData: {
    dataRows: number;
  };
}

export function DataRecoveryDialog({ 
  isOpen, 
  onClose, 
  onUseBackup, 
  onKeepCurrent, 
  backupData, 
  currentData 
}: DataRecoveryDialogProps) {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Unknown time';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Backup Data Found
          </DialogTitle>
          <DialogDescription>
            We found newer backup data that might contain unsaved changes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Current Data</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {currentData.dataRows} rows
              </p>
            </div>
            
            <div className="bg-muted p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-green-600" />
                <span className="font-medium text-sm">Backup Data</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {backupData.dataRows} rows
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Saved: {formatDate(backupData.lastSaved)}
              </p>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground bg-amber-50 p-3 rounded border-l-4 border-amber-400">
            <strong>What happened?</strong> Your browser automatically saved a backup while you were working. 
            This often happens when there's a connectivity issue or the page was refreshed.
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onKeepCurrent}>
            Keep Current
          </Button>
          <Button onClick={onUseBackup} className="bg-green-600 hover:bg-green-700">
            Use Backup Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}