import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, FileStack, Users } from 'lucide-react';

interface BatchUploadDropdownProps {
  onMultipleFiles?: () => void;
  onMultiInstrument: () => void;
  disabled?: boolean;
}

export const BatchUploadDropdown: React.FC<BatchUploadDropdownProps> = ({
  onMultipleFiles,
  onMultiInstrument,
  disabled = false
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={disabled}
        >
          <FileStack className="h-3 w-3" />
          Batch Upload
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56 bg-background border shadow-lg z-50"
      >
        {onMultipleFiles && (
          <DropdownMenuItem 
            onClick={onMultipleFiles}
            className="cursor-pointer"
          >
            <FileStack className="h-4 w-4 mr-2" />
            <div>
              <div className="font-medium">Multiple Files</div>
              <div className="text-xs text-muted-foreground">
                Upload separate documents
              </div>
            </div>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem 
          onClick={onMultiInstrument}
          className="cursor-pointer"
        >
          <Users className="h-4 w-4 mr-2" />
          <div>
            <div className="font-medium">Multi-Instrument Document</div>
            <div className="text-xs text-muted-foreground">
              One PDF with multiple instruments
            </div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};