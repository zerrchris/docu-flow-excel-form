import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Download, Eye, Clock, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MobileCapturedDocument {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  size?: number;
}

interface MobileCapturedDocumentsProps {
  onDocumentSelect?: (url: string, name: string) => void;
}

export const MobileCapturedDocuments: React.FC<MobileCapturedDocumentsProps> = ({ 
  onDocumentSelect 
}) => {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<MobileCapturedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadMobileCapturedDocuments();
  }, []);

  const loadMobileCapturedDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.storage
        .from('documents')
        .list(user.id, {
          limit: 20,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      // Filter for mobile-captured documents (those starting with mobile_document_)
      const mobileDocuments = data?.filter(file => 
        file.name.startsWith('mobile_document_')
      ) || [];

      const documentsWithUrls = mobileDocuments.map(file => {
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(`${user.id}/${file.name}`);

        return {
          id: file.id || file.name,
          name: file.name,
          url: urlData.publicUrl,
          uploadedAt: file.created_at || new Date().toISOString(),
          size: file.metadata?.size
        };
      });

      setDocuments(documentsWithUrls);
    } catch (error: any) {
      console.error('Error loading mobile documents:', error);
      toast({
        title: "Error",
        description: "Failed to load mobile-captured documents.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentSelect = async (doc: MobileCapturedDocument) => {
    try {
      // Convert the image URL to a File object for analysis
      const response = await fetch(doc.url);
      const blob = await response.blob();
      const file = new File([blob], doc.name, { type: blob.type });

      // Create a custom event to trigger document selection in DocumentFrame
      const event = new CustomEvent('mobileDocumentSelected', {
        detail: { file, url: doc.url, name: doc.name }
      });
      window.dispatchEvent(event);

      onDocumentSelect?.(doc.url, doc.name);

      toast({
        title: "Document Selected",
        description: `"${doc.name}" is ready for analysis.`,
      });
    } catch (error) {
      console.error('Error selecting document:', error);
      toast({
        title: "Error",
        description: "Failed to load the selected document.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const MB = bytes / (1024 * 1024);
    return MB > 1 ? `${MB.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  if (documents.length === 0 && !isLoading) {
    return null; // Don't show the component if there are no mobile documents
  }

  return (
    <Card className="p-4 mb-4 border-dashed border-primary/30">
      <div 
        className="flex items-center justify-between cursor-pointer" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          <span className="font-medium">Mobile Captured Documents</span>
          <Badge variant="secondary" className="text-xs">
            {isLoading ? '...' : documents.length}
          </Badge>
        </div>
        <Button variant="ghost" size="sm">
          {isExpanded ? 'Hide' : 'Show'}
        </Button>
      </div>
      
      {isExpanded && (
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="flex space-x-3">
                    <div className="w-12 h-12 bg-muted rounded"></div>
                    <div className="flex-1 space-y-1">
                      <div className="h-3 bg-muted rounded w-3/4"></div>
                      <div className="h-2 bg-muted rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">No mobile documents found.</p>
              <p className="text-xs">Use the Mobile Capture feature to take photos of documents.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-10 h-10 flex-shrink-0">
                      <img
                        src={doc.url}
                        alt={doc.name}
                        className="w-full h-full object-cover rounded border"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        Document Photo
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(doc.uploadedAt)}</span>
                        {doc.size && (
                          <>
                            <span>•</span>
                            <span>{formatFileSize(doc.size)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(doc.url, '_blank');
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDocumentSelect(doc)}
                      className="h-8 px-2 text-xs"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Use
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {documents.length > 0 && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMobileCapturedDocuments}
                disabled={isLoading}
                className="w-full text-xs"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};