import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet } from 'lucide-react';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';

const ActiveRunsheetButton: React.FC = () => {
  const { activeRunsheet } = useActiveRunsheet();

  if (!activeRunsheet) {
    return null;
  }

  return (
    <Link to="/runsheet">
      <Button 
        variant="outline" 
        size="sm"
        className="flex items-center gap-2 text-primary border-primary hover:bg-primary/10"
      >
        <FileSpreadsheet className="h-4 w-4" />
        <span className="hidden sm:inline">Active:</span>
        <span className="font-medium max-w-32 truncate">{activeRunsheet.name}</span>
      </Button>
    </Link>
  );
};

export default ActiveRunsheetButton;