import DocumentProcessor from './DocumentProcessor';
import SubscriptionGuard, { SubscriptionRequired } from '@/components/SubscriptionGuard';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import RunsheetSelectionDialog from '@/components/RunsheetSelectionDialog';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const { hasActiveRunsheet, setCurrentRunsheet } = useActiveRunsheet();
  const [showRunsheetDialog, setShowRunsheetDialog] = useState(false);
  const navigate = useNavigate();

  // If there's an active runsheet, show the document processor
  if (hasActiveRunsheet) {
    return (
      <SubscriptionGuard fallback={<SubscriptionRequired />}>
        <DocumentProcessor />
      </SubscriptionGuard>
    );
  }

  // If no active runsheet, show runsheet selection interface
  return (
    <SubscriptionGuard fallback={<SubscriptionRequired />}>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Document Processor</h1>
            <p className="text-muted-foreground">
              Start by creating a new runsheet or opening an existing one to begin processing documents.
            </p>
          </div>

          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Get Started</CardTitle>
              <CardDescription>
                Choose how you'd like to begin processing documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full h-16 flex flex-col gap-2" 
                onClick={() => {
                  // Create a new working runsheet and navigate to document processor
                  const tempId = `working-${Date.now()}`;
                  setCurrentRunsheet(tempId);
                  // The component will re-render and show DocumentProcessor
                }}
              >
                <Plus className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-semibold">Start New Runsheet</div>
                  <div className="text-sm opacity-80">Begin with a fresh runsheet</div>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full h-16 flex flex-col gap-2"
                onClick={() => setShowRunsheetDialog(true)}
              >
                <FolderOpen className="h-6 w-6" />
                <div className="text-center">
                  <div className="font-semibold">Open Existing Runsheet</div>
                  <div className="text-sm opacity-80">Continue with a saved runsheet</div>
                </div>
              </Button>
            </CardContent>
          </Card>

          <RunsheetSelectionDialog
            open={showRunsheetDialog}
            onOpenChange={setShowRunsheetDialog}
            onRunsheetSelected={(runsheet) => {
              setShowRunsheetDialog(false);
              if (runsheet) {
                setCurrentRunsheet(runsheet.id);
              }
            }}
            title="Select Runsheet"
            description="Choose a runsheet to continue processing documents"
          />
        </div>
      </div>
    </SubscriptionGuard>
  );
};

export default Index;
