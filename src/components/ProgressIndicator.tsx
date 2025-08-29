import React from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, AlertCircle, Upload, RotateCw } from 'lucide-react';

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStep?: string;
  className?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  steps,
  currentStep,
  className = ''
}) => {
  const getStepIcon = (step: ProgressStep, index: number) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'processing':
        return <RotateCw className="h-5 w-5 text-primary animate-spin" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 bg-background flex items-center justify-center">
            <span className="text-xs text-muted-foreground">{index + 1}</span>
          </div>
        );
    }
  };

  const getStepColor = (step: ProgressStep) => {
    switch (step.status) {
      case 'completed':
        return 'text-green-600';
      case 'processing':
        return 'text-primary';
      case 'error':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center space-x-3">
          {getStepIcon(step, index)}
          <div className="flex-1">
            <div className={`font-medium ${getStepColor(step)}`}>
              {step.label}
            </div>
            {step.status === 'processing' && step.progress !== undefined && (
              <Progress value={step.progress} className="mt-2 h-2" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProgressIndicator;