import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Files, ChevronDown, ChevronUp, Smartphone } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import BatchDocumentRow from './BatchDocumentRow';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BatchDocument {
  id: string;
  file: File;
}

interface BatchProcessingProps {
  fields: string[];
  onAddToSpreadsheet: (data: Record<string, string>) => Promise<void>;
  onAnalyze: (file: File) => Promise<Record<string, string>>;
  isAnalyzing: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  hasActiveRunsheet?: boolean;
}

const BatchProcessing: React.FC<BatchProcessingProps> = ({
  fields,
  onAddToSpreadsheet,
  onAnalyze,
  isAnalyzing,
  isExpanded: externalExpanded,
  onExpandedChange: externalOnExpandedChange,
  hasActiveRunsheet = false
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);

  // Use external state if provided, otherwise use internal state
  const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded;
  const setIsExpanded = externalOnExpandedChange || setInternalExpanded;
  const [batchDocuments, setBatchDocuments] = useState<BatchDocument[]>([]);
  const [isUploadAreaExpanded, setIsUploadAreaExpanded] = useState(true);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState<number | null>(null);
  const [isLoadingMobileDocs, setIsLoadingMobileDocs] = useState(false);
  const activeDocumentRef = React.useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Save batch processing state to localStorage
  const saveBatchState = (documents: BatchDocument[], expanded: boolean, activeIndex: number | null) => {
    try {
      const state = {
        documents: documents.map(doc => ({
          id: doc.id,
          fileName: doc.file.name,
          fileSize: doc.file.size,
          fileType: doc.file.type
        })),
        isExpanded: expanded,
        activeDocumentIndex: activeIndex,
        timestamp: Date.now()
      };
      localStorage.setItem('batch-processing-state', JSON.stringify(state));
      console.log('💾 Saved batch processing state');
    } catch (error) {
      console.error('Error saving batch state:', error);
    }
  };

  // Save file data to localStorage
  const saveBatchFileData = async (documents: BatchDocument[]) => {
    try {
      const fileDataArray = await Promise.all(
        documents.map(async (doc) => {
          const buffer = await doc.file.arrayBuffer();
          return {
            data: Array.from(new Uint8Array(buffer))
          };
        })
      );
      localStorage.setItem('batch-processing-files', JSON.stringify(fileDataArray));
    } catch (error) {
      console.error('Error saving batch file data:', error);
    }
  };

  // Clear batch processing state
  const clearBatchState = () => {
    localStorage.removeItem('batch-processing-state');
    localStorage.removeItem('batch-processing-files');
    localStorage.removeItem('batch-docs-count');
    console.log('🗑️ Cleared batch processing state');
  };

  // Restore batch processing state on mount
  useEffect(() => {
    const restoreBatchState = async () => {
      try {
        const savedState = localStorage.getItem('batch-processing-state');
        if (!savedState) return;

        const state = JSON.parse(savedState);
        const stateAge = Date.now() - (state.timestamp || 0);
        
        // Only restore if less than 30 minutes old
        if (stateAge > 30 * 60 * 1000) {
          clearBatchState();
          return;
        }

        // Check if we have the actual file data saved
        const savedFiles = localStorage.getItem('batch-processing-files');
        if (savedFiles && state.documents?.length > 0) {
          const fileDataArray = JSON.parse(savedFiles);
          const restoredDocuments: BatchDocument[] = [];

          for (let i = 0; i < state.documents.length && i < fileDataArray.length; i++) {
            try {
              const fileData = fileDataArray[i];
              const uint8Array = new Uint8Array(fileData.data);
              const blob = new Blob([uint8Array], { type: state.documents[i].fileType });
              const file = new File([blob], state.documents[i].fileName, { type: state.documents[i].fileType });
              
              restoredDocuments.push({
                id: state.documents[i].id,
                file: file
              });
            } catch (error) {
              console.error('Error restoring file:', error);
            }
          }

          if (restoredDocuments.length > 0) {
            setBatchDocuments(restoredDocuments);
            setIsExpanded(state.isExpanded ?? false);
            setActiveDocumentIndex(state.activeDocumentIndex ?? null);
            setIsUploadAreaExpanded(false);
            
            toast({
              title: "Batch Processing Restored",
              description: `${restoredDocuments.length} documents restored from your previous session.`,
            });
          }
        }
      } catch (error) {
        console.error('Error restoring batch state:', error);
        clearBatchState();
      }
    };

    restoreBatchState();
  }, [toast]);

  const handleAnalyzeMobileDocs = async () => {
    setIsLoadingMobileDocs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to access your mobile captured documents.",
          variant: "destructive",
        });
        return;
      }

      // Get all mobile documents
      const getAllFiles = async (path = '') => {
        const { data, error } = await supabase.storage
          .from('documents')
          .list(`${user.id}${path}`, {
            limit: 100,
            sortBy: { column: 'created_at', order: 'desc' }
          });
        
        if (error) throw error;
        
        let allFiles: any[] = [];
        
        for (const item of data || []) {
          if (item.id === null) {
            // This is a folder, recursively get its contents
            const subFiles = await getAllFiles(`${path}/${item.name}`);
            allFiles = allFiles.concat(subFiles);
          } else if (item.name.startsWith('mobile_document')) {
            // This is a mobile document file
            allFiles.push({
              ...item,
              fullPath: `${path}/${item.name}`.replace(/^\//, ''),
            });
          }
        }
        
        return allFiles;
      };

      const mobileFiles = await getAllFiles();

      if (mobileFiles.length === 0) {
        toast({
          title: "No Mobile Documents Found",
          description: "Use the Mobile Capture feature to take photos of documents first.",
          variant: "destructive",
        });
        return;
      }

      // Convert mobile documents to File objects and add to batch
      const newDocuments: BatchDocument[] = [];
      
      for (const file of mobileFiles) {
        try {
          const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(`${user.id}/${file.fullPath}`);

          const response = await fetch(urlData.publicUrl);
          const blob = await response.blob();
          const fileObj = new File([blob], file.name, { type: blob.type });

          newDocuments.push({
            id: `mobile-${Date.now()}-${Math.random()}`,
            file: fileObj
          });
        } catch (error) {
          console.error(`Failed to load ${file.name}:`, error);
        }
      }

      setBatchDocuments(prev => {
        const newDocs = [...prev, ...newDocuments];
        // Save files to localStorage for restoration
        saveBatchFileData(newDocs);
        return newDocs;
      });
      
      toast({
        title: "Mobile Documents Loaded",
        description: `${newDocuments.length} mobile documents added to batch processing.`,
      });

      // Expand the section and collapse upload area
      setIsExpanded(true);
      setIsUploadAreaExpanded(false);

    } catch (error: any) {
      console.error('Error loading mobile documents:', error);
      toast({
        title: "Error",
        description: "Failed to load mobile captured documents.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMobileDocs(false);
    }
  };

  const handleFilesUpload = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newDocuments: BatchDocument[] = fileArray.map(file => ({
      id: `${Date.now()}-${Math.random()}`,
      file
    }));

    setBatchDocuments(prev => {
      const newDocs = [...prev, ...newDocuments];
      saveBatchState(newDocs, isExpanded, activeDocumentIndex);
      saveBatchFileData(newDocs);
      localStorage.setItem('batch-docs-count', newDocs.length.toString());
      return newDocs;
    });
    
    toast({
      title: "Files uploaded",
      description: `${fileArray.length} document${fileArray.length > 1 ? 's' : ''} added to batch processing.`,
    });

    // Collapse upload area after upload
    if (fileArray.length > 0) {
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
    
    // Calculate next index before updating state
    let nextIndex: number | null = null;
    if (newDocuments.length > 0) {
      // If we removed the last document, go to the previous one
      // Otherwise, stay at the same index (which will be the next document)
      nextIndex = currentIndex >= newDocuments.length ? newDocuments.length - 1 : currentIndex;
    }
    
    setBatchDocuments(newDocuments);
    setActiveDocumentIndex(nextIndex);
    
    // Clear batch state if no documents left
    if (newDocuments.length === 0) {
      clearBatchState();
    } else {
      saveBatchState(newDocuments, isExpanded, nextIndex);
      saveBatchFileData(newDocuments);
      localStorage.setItem('batch-docs-count', newDocuments.length.toString());
    }
  };

  // Save state when expansion or active document changes
  useEffect(() => {
    if (batchDocuments.length > 0) {
      saveBatchState(batchDocuments, isExpanded, activeDocumentIndex);
      localStorage.setItem('batch-docs-count', batchDocuments.length.toString());
    }
  }, [isExpanded, activeDocumentIndex, batchDocuments]);

  // Initialize active document when first document is uploaded
  React.useEffect(() => {
    if (batchDocuments.length > 0 && activeDocumentIndex === null) {
      setActiveDocumentIndex(0);
    }
  }, [batchDocuments.length, activeDocumentIndex]);

  // Scroll to active document when it changes
  React.useEffect(() => {
    if (activeDocumentIndex !== null && activeDocumentRef.current) {
      setTimeout(() => {
        activeDocumentRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100); // Small delay to ensure the component is rendered
    }
  }, [activeDocumentIndex]);

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
                <div className="text-center py-8 text-muted-foreground space-y-4">
                  <Files className="h-12 w-12 mx-auto mb-3 opacity-60" />
                  <div className="space-y-2">
                    <p className="font-medium">
                      {hasActiveRunsheet ? 'No documents uploaded yet' : 'No active runsheet selected'}
                    </p>
                    <p className="text-sm">
                      {hasActiveRunsheet 
                        ? 'Get started by analyzing your mobile captured documents'
                        : 'Please select a runsheet from your dashboard first to enable batch processing'
                      }
                    </p>
                  </div>
                  
                  {hasActiveRunsheet ? (
                    <div className="flex flex-col items-center gap-3 pt-2">
                      <Button
                        onClick={handleAnalyzeMobileDocs}
                        className="gap-2"
                        disabled={isLoadingMobileDocs}
                      >
                        <Smartphone className="h-4 w-4" />
                        {isLoadingMobileDocs ? 'Loading...' : 'Analyze Mobile Documents'}
                      </Button>
                      
                      <p className="text-xs text-muted-foreground">
                        Or upload documents above to start batch processing
                      </p>
                    </div>
                  ) : (
                    <div className="pt-2">
                      <Button 
                        onClick={() => window.location.href = '/dashboard'}
                        variant="outline"
                      >
                        Go to Dashboard
                      </Button>
                    </div>
                  )}
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
                    <div 
                      key={doc.id}
                      ref={activeDocumentIndex === index ? activeDocumentRef : null}
                    >
                      <BatchDocumentRow
                        file={doc.file}
                        fields={fields}
                        onRemove={() => removeBatchDocument(doc.id)}
                        onAddToSpreadsheet={onAddToSpreadsheet}
                        onAnalyze={onAnalyze}
                        isAnalyzing={isAnalyzing}
                        isActive={activeDocumentIndex === index}
                      />
                    </div>
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