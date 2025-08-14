import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadFileToStorage } from '@/utils/fileStorage';
import DataForm from './DataForm';
import DocumentViewer from './DocumentViewer';

import DocumentUpload from './DocumentUpload';

import RealtimeVoiceInput from './RealtimeVoiceInput';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

interface DocumentFrameProps {
  file: File | null;
  previewUrl: string | null;
  fields: string[];
  formData: Record<string, string>;
  columnInstructions?: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onCancelAnalysis?: () => void;
  onAddToSpreadsheet: (data?: Record<string, string>) => Promise<void>;
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
  columnInstructions,
  onChange,
  onAnalyze,
  onCancelAnalysis,
  onAddToSpreadsheet,
  onFileSelect,
  onMultipleFilesSelect,
  onResetDocument,
  isAnalyzing
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem('documentFrameOpen');
      return saved ? JSON.parse(saved) : true; // default open to avoid accidental collapse
    } catch {
      return true;
    }
  });
  const [isUploading, setIsUploading] = useState(false);
  const [hasAddedToSpreadsheet, setHasAddedToSpreadsheet] = useState(false);
  const { toast } = useToast();

  // Listen for mobile document selection events
  React.useEffect(() => {
    const handleMobileDocumentSelected = (event: CustomEvent) => {
      const { file } = event.detail;
      onFileSelect(file);
    };

    window.addEventListener('mobileDocumentSelected', handleMobileDocumentSelected as EventListener);
    
    return () => {
      window.removeEventListener('mobileDocumentSelected', handleMobileDocumentSelected as EventListener);
    };
  }, [onFileSelect]);

  // Persist and restore expanded state across refreshes/remounts
  React.useEffect(() => {
    try {
      sessionStorage.setItem('documentFrameOpen', JSON.stringify(isExpanded));
    } catch {}
  }, [isExpanded]);

  // Auto-open when a file is selected or when form has data (helps after draft restore)
  React.useEffect(() => {
    const hasData = formData && Object.values(formData).some(v => (v || '').toString().trim() !== '');
    if ((file || hasData) && !isExpanded) {
      setIsExpanded(true);
    }
  }, [file, formData, isExpanded]);

  // Wrapper to ensure analyze is called without parameters for single document processing
  const handleAnalyze = () => {
    console.log('DocumentFrame handleAnalyze called - calling onAnalyze() without parameters');
    onAnalyze();
  };

  // Handle voice data extraction
  const handleVoiceDataExtracted = (extractedData: Record<string, string>) => {
    // Update form data with extracted voice data
    Object.entries(extractedData).forEach(([field, value]) => {
      if (fields.includes(field)) {
        onChange(field, value);
      }
    });
  };

  // Handle adding to spreadsheet with file upload
  const handleAddToSpreadsheet = async () => {
    if (!file) {
      await onAddToSpreadsheet();
      return;
    }

    setIsUploading(true);
    try {
      const fileResult = await uploadFileToStorage(file, 'documents', 'single-processed');
      
      const userSpecifiedFilename = formData['Document File Name'];
      const finalFilename = userSpecifiedFilename && userSpecifiedFilename.trim() 
        ? userSpecifiedFilename.trim() 
        : fileResult.fileName;
      
      const dataWithFile = {
        ...formData,
        'Document File Name': finalFilename,
        'Storage Path': fileResult.path
      };
      
      onAddToSpreadsheet(dataWithFile);
      
      // Mark as added to spreadsheet to show upload button
      setHasAddedToSpreadsheet(true);
      
      toast({
        title: "Success",
        description: `Document "${file.name}" processed and uploaded successfully.`,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload Error", 
        description: `Failed to upload "${file.name}". Adding data without file.`,
        variant: "destructive",
      });
      // Still add to spreadsheet but without file data
      await onAddToSpreadsheet();
      
      // Mark as added to spreadsheet to show upload button
      setHasAddedToSpreadsheet(true);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={(open) => {
        setIsExpanded(open);
        // When expanding, just ensure the DataForm component refreshes to show current fields
        if (open) {
          console.log('Document processing expanded - ensuring form shows current fields:', fields);
          
          // Dispatch event to trigger DataForm refresh
          const refreshEvent = new CustomEvent('documentFormRefresh', { 
            detail: { currentFields: fields }
          });
          window.dispatchEvent(refreshEvent);
        }
      }}>
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
                <ResizablePanel defaultSize={33} minSize={25} maxSize={75}>
                  <div className="h-full border-r border-border">
                    <div className="p-6 h-full overflow-auto">
                      <div className="space-y-4">
                        <h4 className="text-md font-medium text-foreground">Document Data</h4>
                        
                        {/* Real-time Voice Input */}
                        <RealtimeVoiceInput
                          fields={fields}
                          columnInstructions={columnInstructions || {}}
                          onDataExtracted={handleVoiceDataExtracted}
                        />
                        
                        
                        {/* Data Form */}
                        <DataForm 
                          fields={fields}
                          formData={formData}
                          onChange={onChange}
                          onAnalyze={handleAnalyze}
                          onCancelAnalysis={onCancelAnalysis}
                          onAddToSpreadsheet={handleAddToSpreadsheet}
                          onResetDocument={() => {
                            setHasAddedToSpreadsheet(false);  // Reset state for new upload
                            onResetDocument();
                          }}
                          isAnalyzing={isAnalyzing}
                          isUploading={isUploading}
                          hasAddedToSpreadsheet={hasAddedToSpreadsheet}
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
                      <div className="h-full p-6 space-y-4">
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