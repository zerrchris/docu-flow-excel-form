import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RunsheetTabProps {
  id: string;
  name: string;
  isActive: boolean;
  hasUnsavedChanges?: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const RunsheetTab: React.FC<RunsheetTabProps> = ({
  id,
  name,
  isActive,
  hasUnsavedChanges = false,
  onSelect,
  onClose
}) => {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose(id);
  };

  return (
    <div
      onClick={() => onSelect(id)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b-2 cursor-pointer transition-all duration-200 min-w-0 max-w-48",
        isActive
          ? "border-primary bg-background text-foreground"
          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {/* Unsaved changes indicator */}
      {hasUnsavedChanges && (
        <div className="w-2 h-2 bg-yellow-500 rounded-full flex-shrink-0" />
      )}
      
      {/* Runsheet name */}
      <span className="truncate text-sm font-medium flex-1 min-w-0">
        {name}
      </span>
      
      {/* Close button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClose}
        className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground flex-shrink-0"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

export default RunsheetTab;