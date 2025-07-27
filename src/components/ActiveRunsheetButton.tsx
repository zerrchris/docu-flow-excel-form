import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet } from 'lucide-react';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';

interface ActiveRunsheetButtonProps {
  onUnsavedChanges?: () => void;
}

const ActiveRunsheetButton: React.FC<ActiveRunsheetButtonProps> = ({ onUnsavedChanges }) => {
  const { activeRunsheet } = useActiveRunsheet();
  const navigate = useNavigate();

  if (!activeRunsheet) {
    return null;
  }

  const handleClick = () => {
    // Check if we're already on the runsheet page to avoid unnecessary navigation
    if (window.location.pathname === '/runsheet') {
      return;
    }

    // Dispatch a custom event to check for unsaved changes
    const checkUnsavedEvent = new CustomEvent('checkUnsavedChanges', {
      detail: {
        targetPath: '/runsheet',
        targetState: { runsheet: activeRunsheet }
      }
    });
    window.dispatchEvent(checkUnsavedEvent);
  };

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={handleClick}
      className="flex items-center gap-2 text-primary border-primary hover:bg-primary/10"
    >
      <FileSpreadsheet className="h-4 w-4" />
      <span className="hidden sm:inline">Active:</span>
      <span className="font-medium max-w-32 truncate">{activeRunsheet.name}</span>
    </Button>
  );
};

export default ActiveRunsheetButton;