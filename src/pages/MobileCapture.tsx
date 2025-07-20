import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { MobileCamera } from '@/components/MobileCamera';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Monitor, Smartphone, CheckCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CapturedDocument {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
  processed: boolean;
}

export const MobileCapture: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<CapturedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMobile = Capacitor.isNativePlatform();

  useEffect(() => {
    loadUserDocuments();
  }, []);

  const loadUserDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.storage
        .from('documents')
        .list(user.id, {
          limit: 50,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      const documentsWithUrls = data?.map(file => {
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(`${user.id}/${file.name}`);

        return {
          id: file.id || file.name,
          name: file.name,
          url: urlData.publicUrl,
          uploadedAt: file.created_at || new Date().toISOString(),
          processed: false // You can enhance this by checking against a processing table
        };
      }) || [];

      setDocuments(documentsWithUrls);
    } catch (error: any) {
      console.error('Error loading documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoUploaded = (url: string, fileName: string) => {
    const newDocument: CapturedDocument = {
      id: fileName,
      name: fileName,
      url,
      uploadedAt: new Date().toISOString(),
      processed: false
    };
    
    setDocuments(prev => [newDocument, ...prev]);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/app')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Button>
          
          <div className="flex items-center gap-2">
            {isMobile ? (
              <Badge variant="default" className="gap-1">
                <Smartphone className="h-3 w-3" />
                Mobile
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <Monitor className="h-3 w-3" />
                Web
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4 space-y-6">
        {/* Welcome Message */}
        <Card className="p-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">Document Capture</h1>
            <p className="text-muted-foreground">
              {isMobile 
                ? "Use your camera to capture documents on the go. Photos sync automatically with your web account."
                : "Upload document photos to analyze later. For the best experience, use the mobile app."
              }
            </p>
          </div>
        </Card>

        {/* Camera Component */}
        <MobileCamera onPhotoUploaded={handlePhotoUploaded} />

        {/* Sync Status */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Synced with Web App</span>
            </div>
            <Badge variant="outline">
              {documents.length} documents
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Photos taken here will be available when you return to the web application for analysis.
          </p>
        </Card>

        {/* File Manager Link */}
        <Card className="p-6">
          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold">View Your Documents</h3>
            <p className="text-muted-foreground">
              Access all your captured documents and manage your files
            </p>
            <Button 
              onClick={() => navigate('/file-manager')}
              className="w-full"
            >
              Go to File Manager
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};