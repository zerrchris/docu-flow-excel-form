import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface ProductionModalProps {
  tracts: string[];
  onSubmit: (productionData: Record<string, string>) => void;
  onClose: () => void;
}

export const ProductionModal: React.FC<ProductionModalProps> = ({
  tracts,
  onSubmit,
  onClose,
}) => {
  const [productionData, setProductionData] = useState<Record<string, string>>({});

  const handleTractUpdate = (tract: string, value: string) => {
    setProductionData(prev => ({
      ...prev,
      [tract]: value
    }));
  };

  const handleSubmit = () => {
    // Fill in default values for tracts without input
    const completeData = { ...productionData };
    tracts.forEach(tract => {
      if (!completeData[tract]) {
        completeData[tract] = 'No active production reported';
      }
    });
    
    onSubmit(completeData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Production Information Required
          </DialogTitle>
          <DialogDescription>
            The analysis found potential expired leases that may be held by production (HBP). 
            Please provide information about any active production on the following lands:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <strong>For each tract below:</strong> If there are active wells or production, 
                please provide details including:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Well names or permit numbers</li>
                <li>Production status (active, shut-in, etc.)</li>
                <li>Any relevant Pugh clause information</li>
                <li>Depth restrictions or other lease terms</li>
              </ul>
              <p>
                <strong>If no production:</strong> Leave blank or enter "No active production"
              </p>
            </CardContent>
          </Card>

          {tracts.map((tract, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="text-base">
                  Tract {index + 1}: {tract}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={productionData[tract] || ''}
                  onChange={(e) => handleTractUpdate(tract, e.target.value)}
                  placeholder="Enter production details for this tract, or leave blank if no production..."
                  rows={3}
                />
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Skip for Now
            </Button>
            <Button onClick={handleSubmit}>
              Update Production Information
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};