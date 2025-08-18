import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Brain, Sparkles } from 'lucide-react';
import DocumentAnalysisWorkflow from './DocumentAnalysisWorkflow';

interface DocumentWorkspaceButtonProps {
  runsheetId: string;
  availableColumns: string[];
  onDataConfirmed: (data: Record<string, string>, file: File) => void;
  buttonText?: string;
  buttonVariant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  showIcon?: boolean;
}

const DocumentWorkspaceButton: React.FC<DocumentWorkspaceButtonProps> = ({
  runsheetId,
  availableColumns,
  onDataConfirmed,
  buttonText = "Add Document",
  buttonVariant = "outline",
  showIcon = true
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleDataConfirmed = async (data: Record<string, string>, file: File) => {
    await onDataConfirmed(data, file);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size="sm">
          {showIcon && <Brain className="h-4 w-4 mr-1" />}
          {buttonText}
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Document Analysis Workspace
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          <DocumentAnalysisWorkflow
            runsheetId={runsheetId}
            availableColumns={availableColumns}
            onDataConfirmed={handleDataConfirmed}
            onClose={() => setIsOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentWorkspaceButton;