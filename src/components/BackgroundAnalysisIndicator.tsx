import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Brain, Eye, Square } from 'lucide-react';
import { backgroundAnalyzer, type AnalysisProgress } from '@/utils/backgroundAnalyzer';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface BackgroundAnalysisIndicatorProps {
  onShowDialog: () => void;
  isMainDialogOpen: boolean;
}

export const BackgroundAnalysisIndicator: React.FC<BackgroundAnalysisIndicatorProps> = ({
  onShowDialog,
  isMainDialogOpen
}) => {
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState<string>('');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing job on mount
    const checkExistingJob = () => {
      const job = backgroundAnalyzer.getJobStatus();
      if (job && job.status === 'running') {
        setIsVisible(true);
        setCurrentJobId(job.id);
        setProgress((job.currentIndex / job.documentMap.length) * 100);
        setJobStatus(`Analyzing ${job.runsheetName}`);
      } else {
        setIsVisible(false);
        setCurrentJobId(null);
      }
    };

    checkExistingJob();

    // Subscribe to progress updates
    const unsubscribe = backgroundAnalyzer.onProgress((progress: AnalysisProgress) => {
      if (progress.status === 'running') {
        setIsVisible(true);
        setCurrentJobId(progress.jobId);
        setProgress((progress.completed / progress.total) * 100);
        // Get job details for runsheet name
        const job = backgroundAnalyzer.getJobStatus();
        setJobStatus(`Analyzing ${job?.runsheetName || 'documents'}`);
      } else if (progress.status === 'completed' || progress.status === 'error' || progress.status === 'cancelled') {
        setIsVisible(false);
        setCurrentJobId(null);
        if (progress.status === 'completed') {
          toast({
            title: "Background analysis completed",
            description: "Document analysis finished successfully.",
          });
        } else if (progress.status === 'cancelled') {
          toast({
            title: "Background analysis cancelled",
            description: "Document analysis has been cancelled.",
          });
        }
      }
    });

    return unsubscribe;
  }, [toast]);

  const handleStop = () => {
    if (currentJobId) {
      backgroundAnalyzer.cancelAnalysis();
      setIsVisible(false);
      setCurrentJobId(null);
      toast({
        title: "Analysis cancelled",
        description: "Background document analysis has been cancelled.",
      });
    }
  };

  // Don't show the background indicator if the main dialog is open
  if (!isVisible || isMainDialogOpen) return null;

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 z-40 p-4 min-w-[320px] max-w-[400px]",
      "bg-background border shadow-lg animate-in slide-in-from-bottom-2"
    )}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-500 animate-pulse" />
          <span className="text-sm font-medium">Background Analysis Running</span>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{jobStatus}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        <div className="flex items-center justify-between gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={onShowDialog}
            className="flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            View Progress
          </Button>
          
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleStop}
            className="flex items-center gap-1"
          >
            <Square className="w-3 h-3" />
            Stop
          </Button>
        </div>
      </div>
    </Card>
  );
};