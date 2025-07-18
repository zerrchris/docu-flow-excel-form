import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, X, FileText } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import DataForm from './DataForm';
import DocumentViewer from './DocumentViewer';

interface BatchDocumentRowProps {
  file: File;
  fields: string[];
  onRemove: () => void;
  onAddToSpreadsheet: (data: Record<string, string>) => void;
  isAnalyzing: boolean;
  onAnalyze: (file: File) => Promise<Record<string, string>>;
}

const BatchDocumentRow: React.FC<BatchDocumentRowProps> = ({
  file,
  fields,
  onRemove,
  onAddToSpreadsheet,
  isAnalyzing,
  onAnalyze
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const emptyData: Record<string, string> = {};
    fields.forEach(field => {
      emptyData[field] = '';
    });
    return emptyData;
  });
  const [isAnalyzingLocal, setIsAnalyzingLocal] = useState(false);

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAnalyze = async () => {
    setIsAnalyzingLocal(true);
    try {
      const analyzedData = await onAnalyze(file);
      setFormData(analyzedData);
    } finally {
      setIsAnalyzingLocal(false);
    }
  };

  const handleAddToSpreadsheet = () => {
    onAddToSpreadsheet(formData);
    onRemove(); // Remove this row after adding to spreadsheet
  };

  return (
    <Card className="mb-3">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between p-4 border-b">
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="flex-1 justify-start text-left hover:bg-muted/50"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium text-foreground truncate max-w-[300px]">
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 ml-auto" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 ml-auto" />
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
            <div className="lg:col-span-4 border-r border-border">
              <div className="p-6">
                <div className="space-y-2">
                  <h4 className="text-md font-medium text-foreground">Document Data</h4>
                  <DataForm 
                    fields={fields}
                    formData={formData}
                    onChange={handleFieldChange}
                    onAnalyze={handleAnalyze}
                    onAddToSpreadsheet={handleAddToSpreadsheet}
                    isAnalyzing={isAnalyzingLocal}
                  />
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
              <DocumentViewer file={file} previewUrl={previewUrl} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default BatchDocumentRow;