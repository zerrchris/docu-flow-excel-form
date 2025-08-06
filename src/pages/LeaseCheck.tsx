import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Download } from 'lucide-react';
import { LeaseCheckUpload } from '@/components/LeaseCheckUpload';
import { LeaseCheckReport } from '@/components/LeaseCheckReport';
import { ProductionModal } from '@/components/ProductionModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export interface MineralOwner {
  name: string;
  interests: string;
  netAcres: number;
  leaseholdStatus: string;
  lastLeaseOfRecord?: {
    lessor: string;
    lessee: string;
    dated: string;
    term: string;
    expiration: string;
    recorded: string;
    documentNumber: string;
  };
  landsConveredOnLease?: string[];
  listedAcreage?: string;
}

export interface Tract {
  legalDescription: string;
  acres: number;
  owners: MineralOwner[];
}

export interface TractData {
  tractId: string;
  legalDescription: string;
  totalAcres: number | string;
  grossAcreageNote?: string;
  needsManualAcres?: boolean;
  owners: MineralOwner[];
  wells?: string[];
  limitationsAndExceptions: string;
}

export interface LeaseCheckData {
  prospect: string;
  totalAcres: number;
  reportFormat: string;
  owners: MineralOwner[];
  wells: string[];
  limitationsAndExceptions: string;
  // New multi-tract format
  hasMultipleTracts?: boolean;
  tracts?: TractData[];
  overallLimitationsAndExceptions?: string;
}

const LeaseCheck = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [documentText, setDocumentText] = useState('');
  const [leaseCheckData, setLeaseCheckData] = useState<LeaseCheckData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [pendingTracts, setPendingTracts] = useState<string[]>([]);
  const [selectedTractIndex, setSelectedTractIndex] = useState(0);
  const [manualAcres, setManualAcres] = useState<{ [tractId: string]: number }>({});
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [showClarificationDialog, setShowClarificationDialog] = useState(false);
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

      console.log('Full response:', response);
      console.log('Response data:', response.data);
      console.log('Response error:', response.error);

      if (response.error) {
        console.error('Supabase function error:', response.error);
        throw new Error(response.error.message || 'Failed to analyze document');
      }

      if (!response.data) {
        console.error('No data in response');
        throw new Error('No data received from analysis');
      }

      const data = response.data;
      console.log('Setting lease check data:', data);
      
      // Check if clarification is needed
      if (data.clarificationNeeded && data.questions) {
        setClarificationQuestions(data.questions);
        setClarificationAnswers(new Array(data.questions.length).fill(''));
        setShowClarificationDialog(true);
        setIsProcessing(false);
        return;
      }
      
      setLeaseCheckData(data);

      // Handle both old single-tract and new multi-tract formats
      if (data.hasMultipleTracts && data.tracts) {
        // Multi-tract format - check if any need production info
        const needsProduction = data.tracts.some((tract: TractData) => 
          tract.owners.some((owner: MineralOwner) => 
            owner.leaseholdStatus === 'Unknown' || 
            (owner.lastLeaseOfRecord && !owner.lastLeaseOfRecord.expiration)
          )
        );

        if (needsProduction) {
          setPendingTracts(data.tracts.map((tract: TractData) => tract.tractId));
          setShowProductionModal(true);
        }
      } else if (data.owners && data.owners.length > 0) {
        // Single tract format (legacy)
        const needsProduction = data.owners.some((owner: MineralOwner) => 
          owner.leaseholdStatus === 'Unknown' || 
          (owner.lastLeaseOfRecord && !owner.lastLeaseOfRecord.expiration)
        );

        if (needsProduction) {
          setPendingTracts([data.prospect || 'Current Tract']);
          setShowProductionModal(true);
        }
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
    setShowProductionModal(false);
    toast({
      title: "Updated",
      description: "Production information noted",
    });
  };

  const handleClarificationSubmit = async () => {
    setShowClarificationDialog(false);
    setIsProcessing(true);
    
    try {
      // Combine original document with clarification answers
      const clarificationText = clarificationQuestions.map((q, i) => 
        `Q: ${q}\nA: ${clarificationAnswers[i]}`
      ).join('\n\n');
      
      const enhancedDocumentText = `${documentText}\n\nCLARIFICATION FROM USER:\n${clarificationText}`;
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('analyze-lease-check', {
        body: { documentText: enhancedDocumentText, clarificationProvided: true },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to analyze document');
      }

      const data = response.data;
      setLeaseCheckData(data);
      
      // Handle production modal logic (same as before)
      if (data.hasMultipleTracts && data.tracts) {
        const needsProduction = data.tracts.some((tract: TractData) => 
          tract.owners?.some((owner: MineralOwner) => 
            owner.leaseholdStatus === 'Unknown' || 
            (owner.lastLeaseOfRecord && !owner.lastLeaseOfRecord.expiration)
          )
        );

        if (needsProduction) {
          setPendingTracts(data.tracts.map((tract: TractData) => tract.tractId));
          setShowProductionModal(true);
        }
      }

      setActiveTab('results');
      toast({
        title: "Success",
        description: "Document analyzed successfully with clarifications",
      });
    } catch (error) {
      console.error('Error processing document with clarifications:', error);
      toast({
        title: "Error",
        description: "Failed to analyze document with clarifications. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const updateTractAcres = (tractId: string, acres: number) => {
    setManualAcres(prev => ({ ...prev, [tractId]: acres }));
  };

  const getCurrentTractData = () => {
    if (!leaseCheckData) return null;
    
    if (leaseCheckData.hasMultipleTracts && leaseCheckData.tracts) {
      return leaseCheckData.tracts[selectedTractIndex];
    }
    
    // Convert legacy format to tract format for display
    return {
      tractId: "Main Tract",
      legalDescription: leaseCheckData.prospect,
      totalAcres: leaseCheckData.totalAcres,
      owners: leaseCheckData.owners,
      wells: leaseCheckData.wells || [],
      limitationsAndExceptions: leaseCheckData.limitationsAndExceptions
    };
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
              selectedTractIndex={selectedTractIndex}
              onTractChange={setSelectedTractIndex}
              manualAcres={manualAcres}
              onUpdateAcres={updateTractAcres}
              onNewAnalysis={() => {
                setLeaseCheckData(null);
                setDocumentText('');
                setSelectedTractIndex(0);
                setManualAcres({});
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

      {/* Clarification Dialog */}
      <Dialog open={showClarificationDialog} onOpenChange={setShowClarificationDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Clarification Needed</DialogTitle>
            <DialogDescription>
              The AI needs clarification to provide the best analysis. Please answer the following questions:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {clarificationQuestions.map((question, index) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={`clarification-${index}`} className="text-sm font-medium">
                  {index + 1}. {question}
                </Label>
                <Textarea
                  id={`clarification-${index}`}
                  value={clarificationAnswers[index]}
                  onChange={(e) => {
                    const newAnswers = [...clarificationAnswers];
                    newAnswers[index] = e.target.value;
                    setClarificationAnswers(newAnswers);
                  }}
                  placeholder="Enter your answer..."
                  className="min-h-[60px]"
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowClarificationDialog(false);
                setIsProcessing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleClarificationSubmit}
              disabled={clarificationAnswers.some(answer => !answer.trim())}
            >
              Continue Analysis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaseCheck;