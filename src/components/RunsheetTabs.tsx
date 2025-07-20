import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import RunsheetTab from './RunsheetTab';
import { useMultipleRunsheets, ActiveRunsheet } from '@/hooks/useMultipleRunsheets';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface RunsheetTabsProps {
  children: React.ReactNode;
}

const RunsheetTabs: React.FC<RunsheetTabsProps> = ({ children }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    activeRunsheets, 
    currentTabId, 
    removeRunsheet, 
    switchToTab, 
    addRunsheet 
  } = useMultipleRunsheets();

  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);
  const [runsheetToClose, setRunsheetToClose] = useState<string | null>(null);

  const handleTabSelect = (runsheetId: string) => {
    switchToTab(runsheetId);
  };

  const handleTabClose = (runsheetId: string) => {
    const runsheet = activeRunsheets.find(r => r.id === runsheetId);
    
    // If runsheet has unsaved changes, show confirmation dialog
    if (runsheet?.hasUnsavedChanges) {
      setRunsheetToClose(runsheetId);
      setShowCloseConfirmDialog(true);
    } else {
      closeRunsheet(runsheetId);
    }
  };

  const closeRunsheet = (runsheetId: string) => {
    removeRunsheet(runsheetId);
    
    // If no tabs left, navigate to dashboard
    if (activeRunsheets.length === 1) { // Will be 0 after removal
      navigate('/app');
    }
    
    setShowCloseConfirmDialog(false);
    setRunsheetToClose(null);
  };

  const handleForceClose = () => {
    if (runsheetToClose) {
      closeRunsheet(runsheetToClose);
    }
  };

  const handleNewTab = () => {
    // Generate a new runsheet ID and add it
    const newRunsheet: ActiveRunsheet = {
      id: `new-${Date.now()}`,
      name: 'New Runsheet',
      data: [],
      columns: [],
      columnInstructions: {},
      hasUnsavedChanges: false
    };
    
    addRunsheet(newRunsheet);
  };

  const runsheetToCloseData = runsheetToClose ? activeRunsheets.find(r => r.id === runsheetToClose) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      {activeRunsheets.length > 0 && (
        <div className="flex items-center border-b bg-muted/30">
          <div className="flex items-center overflow-x-auto flex-1">
            {activeRunsheets.map((runsheet) => (
              <RunsheetTab
                key={runsheet.id}
                id={runsheet.id}
                name={runsheet.name}
                isActive={runsheet.id === currentTabId}
                hasUnsavedChanges={runsheet.hasUnsavedChanges}
                onSelect={handleTabSelect}
                onClose={handleTabClose}
              />
            ))}
          </div>
          
          {/* New Tab Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewTab}
            className="flex-shrink-0 mx-2"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>

      {/* Close Confirmation Dialog */}
      <Dialog open={showCloseConfirmDialog} onOpenChange={setShowCloseConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Runsheet</DialogTitle>
            <DialogDescription>
              "{runsheetToCloseData?.name}" has unsaved changes. Are you sure you want to close it without saving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCloseConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceClose}
            >
              Close Without Saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RunsheetTabs;