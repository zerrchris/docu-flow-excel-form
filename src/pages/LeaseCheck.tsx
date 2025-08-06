import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Download } from 'lucide-react';
import { LeaseCheckUpload } from '@/components/LeaseCheckUpload';
import { LeaseCheckReport } from '@/components/LeaseCheckReport';
import { ProductionModal } from '@/components/ProductionModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface MineralOwner {
  name: string;
  address: string;
  vestingSource: string;
  status: 'Leased' | 'Open/Unleased' | 'Expired (Potential HBP)';
  lastLease?: {
    lessor: string;
    lessee: string;
    dated: string;
    term: string;
    expiration: string;
    recordedDoc: string;
  };
  pughClause: string;
  heldByProduction: string;
  notes: string;
}

export interface Tract {
  legalDescription: string;
  acres: number;
  owners: MineralOwner[];
}

export interface LeaseCheckData {
  prospect: string;
  totalAcres: number;
  tracts: Tract[];
  openInterests: number;
  earliestExpiring?: string;
  unresearchedLeases: number;
  wells: string[];
  limitationsAndExceptions: string;
}

const LeaseCheck = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [documentText, setDocumentText] = useState('');
  const [leaseCheckData, setLeaseCheckData] = useState<LeaseCheckData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [pendingTracts, setPendingTracts] = useState<string[]>([]);
  const { toast } = useToast();

  const handleDocumentUpload = (text: string) => {
    setDocumentText(text);
    setActiveTab('review');
  };

  const processDocument = async () => {
    if (!documentText.trim()) {
      toast({
        title: "Error",
        description: "Please provide document content to analyze",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Call our lease check analysis edge function
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('analyze-lease-check', {
        body: { documentText },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to analyze document');
      }

      const data = response.data;
      setLeaseCheckData(data);

      // Check if we need production information
      const tractsNeedingProduction = data.tracts.filter((tract: Tract) => 
        tract.owners.some((owner: MineralOwner) => 
          owner.heldByProduction.includes('Unknown')
        )
      ).map((tract: Tract) => tract.legalDescription);

      if (tractsNeedingProduction.length > 0) {
        setPendingTracts(tractsNeedingProduction);
        setShowProductionModal(true);
      }

      setActiveTab('results');
      toast({
        title: "Success",
        description: "Document analyzed successfully",
      });
    } catch (error) {
      console.error('Error processing document:', error);
      toast({
        title: "Error",
        description: "Failed to analyze document. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProductionUpdate = (productionData: Record<string, string>) => {
    if (!leaseCheckData) return;

    const updatedData = { ...leaseCheckData };
    updatedData.tracts = updatedData.tracts.map(tract => ({
      ...tract,
      owners: tract.owners.map(owner => ({
        ...owner,
        heldByProduction: productionData[tract.legalDescription] || owner.heldByProduction
      }))
    }));

    setLeaseCheckData(updatedData);
    setShowProductionModal(false);
    toast({
      title: "Updated",
      description: "Production information has been updated",
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Lease Check Analyzer</h1>
        <p className="text-muted-foreground">
          Analyze oil and gas runsheet documents to determine lease status and mineral ownership
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="review">
            <FileText className="w-4 h-4 mr-2" />
            Review
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!leaseCheckData}>
            <Download className="w-4 h-4 mr-2" />
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <LeaseCheckUpload onDocumentUpload={handleDocumentUpload} />
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                placeholder="Paste your runsheet document content here or upload using the Upload tab..."
                className="min-h-[400px]"
              />
              <div className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setActiveTab('upload')}
                >
                  Back to Upload
                </Button>
                <Button 
                  onClick={processDocument}
                  disabled={isProcessing || !documentText.trim()}
                >
                  {isProcessing ? 'Analyzing...' : 'Analyze Document'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {leaseCheckData && (
            <LeaseCheckReport 
              data={leaseCheckData}
              onNewAnalysis={() => {
                setLeaseCheckData(null);
                setDocumentText('');
                setActiveTab('upload');
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      {showProductionModal && (
        <ProductionModal
          tracts={pendingTracts}
          onSubmit={handleProductionUpdate}
          onClose={() => setShowProductionModal(false)}
        />
      )}
    </div>
  );
};

export default LeaseCheck;