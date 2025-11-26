import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { FileText, AlertTriangle } from 'lucide-react';

interface Instrument {
  id: number;
  type: string;
  description: string;
  snippet?: string;
}

interface InstrumentSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  instruments: Instrument[];
  onSelect: (instrumentId: number) => void;
}

const InstrumentSelectionDialog: React.FC<InstrumentSelectionDialogProps> = ({
  open,
  onClose,
  instruments,
  onSelect
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(
    instruments.length > 0 ? instruments[0].id : null
  );

  const handleConfirm = () => {
    if (selectedId !== null) {
      onSelect(selectedId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Multiple Instruments Detected
          </DialogTitle>
          <DialogDescription>
            This page contains {instruments.length} instruments. Please select which one you'd like to extract data from.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={selectedId?.toString()}
            onValueChange={(value) => setSelectedId(Number(value))}
            className="space-y-3"
          >
            {instruments.map((instrument) => (
              <Card
                key={instrument.id}
                className={`p-4 cursor-pointer transition-colors ${
                  selectedId === instrument.id
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-muted-foreground/50'
                }`}
                onClick={() => setSelectedId(instrument.id)}
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={instrument.id.toString()} id={`instrument-${instrument.id}`} />
                  <div className="flex-1 space-y-2">
                    <Label
                      htmlFor={`instrument-${instrument.id}`}
                      className="flex items-center gap-2 cursor-pointer font-semibold"
                    >
                      <FileText className="h-4 w-4" />
                      Instrument #{instrument.id}: {instrument.type}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {instrument.description}
                    </p>
                    {instrument.snippet && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono">
                        {instrument.snippet}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedId === null}>
            Extract Selected Instrument
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InstrumentSelectionDialog;