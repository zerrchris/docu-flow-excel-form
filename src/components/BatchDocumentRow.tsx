import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, X, FileText, SkipForward } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { uploadFileToStorage } from '@/utils/fileStorage';
import DataForm from './DataForm';
import DocumentViewer from './DocumentViewer';

interface BatchDocumentRowProps {
  file: File;
  fields: string[];
  onRemove: () => void;
  onAddToSpreadsheet: (data: Record<string, string>) => Promise<void>;
  isAnalyzing: boolean;
  onAnalyze: (file: File) => Promise<Record<string, string>>;
  isActive?: boolean;
}

const BatchDocumentRow: React.FC<BatchDocumentRowProps> = ({
  file,
  fields,
  onRemove,
  onAddToSpreadsheet,
  isAnalyzing,
  onAnalyze,
  isActive = false
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
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Auto-expand when this document becomes active
  React.useEffect(() => {
    if (isActive && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isActive, isExpanded]);

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
      
      // Force sync each field back to ensure state consistency
      Object.entries(analyzedData).forEach(([field, value]) => {
        handleFieldChange(field, value);
      });
    } finally {
      setIsAnalyzingLocal(false);
    }
  };

  const handleAddToSpreadsheet = async () => {
    console.log('🔧 BatchDocumentRow: handleAddToSpreadsheet called');
    console.log('🔧 BatchDocumentRow: formData:', formData);
    
    setIsUploading(true);
    try {
      console.log('🔧 BatchDocumentRow: Starting file upload to storage');
      
      // Upload file to storage
      const fileResult = await uploadFileToStorage(file, 'documents', 'batch-processed');
      console.log('🔧 BatchDocumentRow: File upload result:', fileResult);
      
      // Add file information to the form data
      // Use user-specified filename if provided, otherwise use uploaded filename
      const userSpecifiedFilename = formData['Document File Name'];
      const finalFilename = userSpecifiedFilename && userSpecifiedFilename.trim() 
        ? userSpecifiedFilename.trim() 
        : fileResult.fileName;
      
      const dataWithFile = {
        ...formData,
        'Document File Name': finalFilename,
        'Storage Path': fileResult.path
      };
      
      console.log('🔧 BatchDocumentRow: Final data to send to spreadsheet:', dataWithFile);
      console.log('🔧 BatchDocumentRow: About to call onAddToSpreadsheet');
      
      await onAddToSpreadsheet(dataWithFile);
      
      console.log('🔧 BatchDocumentRow: onAddToSpreadsheet completed, removing from batch');
      onRemove(); // Remove this row after adding to spreadsheet
      
      toast({
        title: "Success",
        description: `Document "${file.name}" processed and uploaded successfully.`,
      });
    } catch (error) {
      console.error('🔧 BatchDocumentRow: Error uploading file:', error);
      toast({
        title: "Upload Error",
        description: `Failed to upload "${file.name}". Adding data without file.`,
        variant: "destructive",
      });
      
      console.log('🔧 BatchDocumentRow: Fallback - adding to spreadsheet without file upload');
      console.log('🔧 BatchDocumentRow: Fallback data:', formData);
      
      // Still add to spreadsheet but without file data
      await onAddToSpreadsheet(formData);
      onRemove();
    } finally {
      setIsUploading(false);
    }
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-md font-medium text-foreground">Document Data</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRemove}
                      className="gap-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip Document
                    </Button>
                  </div>
                  <DataForm 
                    fields={fields}
                    formData={formData}
                    onChange={handleFieldChange}
                    onAnalyze={handleAnalyze}
                    onAddToSpreadsheet={handleAddToSpreadsheet}
                    isAnalyzing={isAnalyzingLocal}
                    isUploading={isUploading}
                  />
                </div>
              </div>
            </div>
            <div className="lg:col-span-8 max-h-[1000px] overflow-hidden">
              <DocumentViewer file={file} previewUrl={previewUrl} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default BatchDocumentRow;