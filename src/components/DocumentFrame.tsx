import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import DataForm from './DataForm';
import DocumentViewer from './DocumentViewer';
import DocumentUpload from './DocumentUpload';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DocumentFrameProps {
  file: File | null;
  previewUrl: string | null;
  fields: string[];
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onAddToSpreadsheet: () => void;
  onFileSelect: (file: File) => void;
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
  isAnalyzing
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

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
                Document Processing
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 h-[600px]">
              <div className="lg:col-span-4 border-r border-border">
                <div className="p-6 h-full">
                  <div className="space-y-2">
                    <h4 className="text-md font-medium text-foreground">Document Data</h4>
                    <DataForm 
                      fields={fields}
                      formData={formData}
                      onChange={onChange}
                      onAnalyze={onAnalyze}
                      onAddToSpreadsheet={onAddToSpreadsheet}
                      isAnalyzing={isAnalyzing}
                    />
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8 h-full">
                {file ? (
                  <DocumentViewer file={file} previewUrl={previewUrl} />
                ) : (
                  <div className="p-6 h-full flex items-center justify-center">
                    <div className="w-full">
                      <DocumentUpload onFileSelect={onFileSelect} selectedFile={file} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default DocumentFrame;