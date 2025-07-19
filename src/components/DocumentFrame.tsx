import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import DataForm from './DataForm';
import DocumentViewer from './DocumentViewer';
import DocumentUpload from './DocumentUpload';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

interface DocumentFrameProps {
  file: File | null;
  previewUrl: string | null;
  fields: string[];
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onAddToSpreadsheet: () => void;
  onFileSelect: (file: File) => void;
  onMultipleFilesSelect?: (files: File[]) => void;
  onResetDocument: () => void;
  isAnalyzing: boolean;
}

const DocumentFrame: React.FC<DocumentFrameProps> = ({
  file,
  previewUrl,
  fields,
  formData,
  onChange,
  onAnalyze,
  onAddToSpreadsheet,
  onFileSelect,
  onMultipleFilesSelect,
  onResetDocument,
  isAnalyzing
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Wrapper to ensure analyze is called without parameters for single document processing
  const handleAnalyze = () => {
    console.log('DocumentFrame handleAnalyze called - calling onAnalyze() without parameters');
    onAnalyze();
  };

  return (
    <Card className="rounded-lg overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between p-4 h-auto text-left hover:bg-muted/50"
          >
            <div className="flex flex-col items-start">
              <h3 className="text-lg font-semibold text-foreground">
                Single Document Processing
              </h3>
              <p className="text-sm text-muted-foreground">
                {file ? file.name : 'No document selected'}
              </p>
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="border-t">
            <div className="h-[1000px]">
              <ResizablePanelGroup direction="horizontal" className="w-full h-full">
                <ResizablePanel defaultSize={33} minSize={25} maxSize={50}>
                  <div className="h-full border-r border-border">
                    <div className="p-6 h-full overflow-auto">
                      <div className="space-y-2">
                        <h4 className="text-md font-medium text-foreground">Document Data</h4>
                        <DataForm 
                          fields={fields}
                          formData={formData}
                          onChange={onChange}
                          onAnalyze={handleAnalyze}
                          onAddToSpreadsheet={onAddToSpreadsheet}
                          onResetDocument={onResetDocument}
                          isAnalyzing={isAnalyzing}
                        />
                      </div>
                    </div>
                  </div>
                </ResizablePanel>
                
                <ResizableHandle withHandle />
                
                <ResizablePanel defaultSize={67}>
                  <div className="h-full">
                    {file ? (
                      <DocumentViewer file={file} previewUrl={previewUrl} />
                    ) : (
                      <div className="h-full">
                        <DocumentUpload 
                          onFileSelect={onFileSelect} 
                          onMultipleFilesSelect={onMultipleFilesSelect}
                          selectedFile={file}
                          allowMultiple={true}
                        />
                      </div>
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default DocumentFrame;