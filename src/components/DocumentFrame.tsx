import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { uploadFileToStorage } from '@/utils/fileStorage';
import DataForm from './DataForm';
import DocumentViewer from './DocumentViewer';
import { MobileCapturedDocuments } from './MobileCapturedDocuments';
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
  onAddToSpreadsheet: (data?: Record<string, string>) => void;
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
  const [isUploading, setIsUploading] = useState(false);
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

  // Wrapper to ensure analyze is called without parameters for single document processing
  const handleAnalyze = () => {
    console.log('DocumentFrame handleAnalyze called - calling onAnalyze() without parameters');
    onAnalyze();
  };

  // Handle adding to spreadsheet with file upload
  const handleAddToSpreadsheet = async () => {
    if (!file) {
      onAddToSpreadsheet();
      return;
    }

    setIsUploading(true);
    try {
      // Upload file to storage
      const fileResult = await uploadFileToStorage(file, 'documents', 'single-processed');
      
      // Create enhanced data with file information
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
      
      // Call onAddToSpreadsheet with the enhanced data
      onAddToSpreadsheet(dataWithFile);
      
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
      onAddToSpreadsheet();
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="rounded-none overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={(open) => {
        setIsExpanded(open);
        // When expanding, populate form fields fresh from current spreadsheet columns
        if (open) {
          console.log('Document processing expanded - clearing old form data and using current fields:', fields);
          const freshFormData: Record<string, string> = {};
          fields.forEach(field => {
            freshFormData[field] = '';
          });
          // Clear any old form data and set fresh fields
          Object.keys(formData).forEach(key => {
            if (!fields.includes(key)) {
              // Remove old fields that don't exist in current spreadsheet
              const updatedFormData = {...formData};
              delete updatedFormData[key];
            }
          });
          // Populate with current fields only
          fields.forEach(field => {
            onChange(field, formData[field] || '');
          });
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
                      <div className="space-y-2">
                        <h4 className="text-md font-medium text-foreground">Document Data</h4>
                        <DataForm 
                          fields={fields}
                          formData={formData}
                          onChange={onChange}
                          onAnalyze={handleAnalyze}
                          onAddToSpreadsheet={handleAddToSpreadsheet}
                          onResetDocument={onResetDocument}
                          isAnalyzing={isAnalyzing}
                          isUploading={isUploading}
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
                        <MobileCapturedDocuments />
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