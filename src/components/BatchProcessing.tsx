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
    setBatchDocuments(prev => prev.filter(doc => doc.id !== id));
  };

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
            {/* Upload Area */}
            <div className="p-6 border-b">
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
                  {batchDocuments.map((doc) => (
                    <BatchDocumentRow
                      key={doc.id}
                      file={doc.file}
                      fields={fields}
                      onRemove={() => removeBatchDocument(doc.id)}
                      onAddToSpreadsheet={onAddToSpreadsheet}
                      onAnalyze={onAnalyze}
                      isAnalyzing={isAnalyzing}
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