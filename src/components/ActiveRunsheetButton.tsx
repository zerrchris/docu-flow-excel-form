import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileSpreadsheet, ChevronDown, Plus } from 'lucide-react';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import { useMultipleRunsheets } from '@/hooks/useMultipleRunsheets';

const ActiveRunsheetButton: React.FC = () => {
  const { activeRunsheet } = useActiveRunsheet();
  const { activeRunsheets, switchToTab } = useMultipleRunsheets();

  if (!activeRunsheet && activeRunsheets.length === 0) {
    return null;
  }

  // If only one active runsheet, show simple button
  if (activeRunsheets.length === 1) {
    return (
      <Link to="/runsheet">
        <Button 
          variant="outline" 
          size="sm"
          className="flex items-center gap-2 text-primary border-primary hover:bg-primary/10"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span className="hidden sm:inline">Active:</span>
          <span className="font-medium max-w-32 truncate">{activeRunsheet?.name || activeRunsheets[0].name}</span>
        </Button>
      </Link>
    );
  }

  // If multiple active runsheets, show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="flex items-center gap-2 text-primary border-primary hover:bg-primary/10"
        >
          <FileSpreadsheet className="h-4 w-4" />
          <span className="hidden sm:inline">Active ({activeRunsheets.length}):</span>
          <span className="font-medium max-w-32 truncate">
            {activeRunsheet?.name || activeRunsheets[0].name}
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {activeRunsheets.map((runsheet, index) => (
          <DropdownMenuItem
            key={runsheet.id}
            onClick={() => {
              switchToTab(runsheet.id);
              window.location.href = '/runsheet';
            }}
            className="flex items-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{runsheet.name}</p>
              {runsheet.hasUnsavedChanges && (
                <p className="text-xs text-yellow-600">Unsaved changes</p>
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.location.href = '/runsheet'}>
          <Plus className="h-4 w-4 mr-2" />
          New Runsheet
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ActiveRunsheetButton;