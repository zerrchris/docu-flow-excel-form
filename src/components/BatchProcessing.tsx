import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Files, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import BatchDocumentRow from './BatchDocumentRow';
import { useToast } from '@/hooks/use-toast';

interface BatchDocument {
  id: string;
  file: File;
}

interface BatchProcessingProps {
  fields: string[];
  onAddToSpreadsheet: (data: Record<string, string>) => void;
  onAnalyze: (file: File) => Promise<Record<string, string>>;
  isAnalyzing: boolean;
}

const BatchProcessing: React.FC<BatchProcessingProps> = ({
  fields,
  onAddToSpreadsheet,
  onAnalyze,
  isAnalyzing
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [batchDocuments, setBatchDocuments] = useState<BatchDocument[]>([]);
  const [isUploadAreaExpanded, setIsUploadAreaExpanded] = useState(true);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const handleFilesUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newDocuments: BatchDocument[] = fileArray.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file
    }));

    setBatchDocuments(prev => [...prev, ...newDocuments]);
    
    toast({
      title: "Files uploaded",
      description: `${fileArray.length} document${fileArray.length > 1 ? 's' : ''} added to batch processing.`,
    });

    // Collapse upload area after first upload
    if (batchDocuments.length === 0 && fileArray.length > 0) {
      setIsUploadAreaExpanded(false);
    }

    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(e.target.files);
      e.target.value = ''; // Reset input
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFilesUpload(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const removeBatchDocument = (id: string) => {
    const currentIndex = batchDocuments.findIndex(doc => doc.id === id);
    const newDocuments = batchDocuments.filter(doc => doc.id !== id);
    
    setBatchDocuments(newDocuments);
    
    // If we removed a document and there are more documents, navigate to next one
    if (newDocuments.length > 0) {
      // If we removed the last document, go to the previous one
      // Otherwise, stay at the same index (which will be the next document)
      const nextIndex = currentIndex >= newDocuments.length ? newDocuments.length - 1 : currentIndex;
      setActiveDocumentIndex(nextIndex);
    } else {
      setActiveDocumentIndex(null);
    }
  };

  // Initialize active document when first document is uploaded
  React.useEffect(() => {
    if (batchDocuments.length > 0 && activeDocumentIndex === null) {
      setActiveDocumentIndex(0);
    }
  }, [batchDocuments.length, activeDocumentIndex]);

  return (
    <Card className="mt-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between p-4 h-auto text-left hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <Files className="h-5 w-5 text-primary" />
              <div className="flex flex-col items-start">
                <h3 className="text-lg font-semibold text-foreground">
                  Batch Processing
                </h3>
                <p className="text-sm text-muted-foreground">
                  {batchDocuments.length === 0 
                    ? 'Upload multiple documents for batch processing'
                    : `${batchDocuments.length} document${batchDocuments.length > 1 ? 's' : ''} in queue`
                  }
                </p>
              </div>
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
            {/* Upload Area - Collapsible */}
            <div className="border-b">
              {isUploadAreaExpanded || batchDocuments.length === 0 ? (
                <div className="p-6">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-muted/20"
                  >
                    <div className="flex flex-col items-center space-y-3">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="space-y-2">
                        <p className="text-foreground">
                          Drop multiple documents here, or
                        </p>
                        <Button variant="outline" asChild>
                          <label htmlFor="batch-file-upload" className="cursor-pointer">
                            Browse Files
                          </label>
                        </Button>
                        <input
                          id="batch-file-upload"
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.webp,.doc,.docx"
                          onChange={handleFileInput}
                          className="hidden"
                          multiple
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Upload multiple individual documents for processing
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsUploadAreaExpanded(true)}
                    className="w-full h-12 bg-muted/20 hover:bg-muted/40 border-dashed transition-all duration-200 animate-fade-in"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Add More Documents
                  </Button>
                </div>
              )}
            </div>

            {/* Batch Document Rows */}
            <div className="p-6 space-y-0">
              {batchDocuments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Files className="h-12 w-12 mx-auto mb-3 opacity-60" />
                  <p>No documents uploaded yet</p>
                  <p className="text-sm">Upload documents above to start batch processing</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-foreground mb-2">
                      Documents to Process ({batchDocuments.length})
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Expand each document to analyze and add to runsheet. Processed documents will be removed automatically.
                    </p>
                  </div>
                  {batchDocuments.map((doc, index) => (
                    <BatchDocumentRow
                      key={doc.id}
                      file={doc.file}
                      fields={fields}
                      onRemove={() => removeBatchDocument(doc.id)}
                      onAddToSpreadsheet={onAddToSpreadsheet}
                      onAnalyze={onAnalyze}
                      isAnalyzing={isAnalyzing}
                      isActive={activeDocumentIndex === index}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default BatchProcessing;