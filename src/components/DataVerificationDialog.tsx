import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, Edit3 } from 'lucide-react';

interface DataVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onEdit: () => void;
  extractedData: Record<string, string>;
  fileName?: string;
}

const DataVerificationDialog: React.FC<DataVerificationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onEdit,
  extractedData,
  fileName
}) => {
  const extractedFields = Object.entries(extractedData).filter(([_, value]) => value.trim() !== '');
  const emptyFields = Object.entries(extractedData).filter(([_, value]) => value.trim() === '');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Verify Extracted Data
          </DialogTitle>
          <DialogDescription>
            Please review the data extracted from {fileName || 'your document'} before adding it to the runsheet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Successfully extracted fields */}
          {extractedFields.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Successfully Extracted ({extractedFields.length} fields)
              </h4>
              <div className="space-y-2">
                {extractedFields.map(([field, value]) => (
                  <div key={field} className="bg-green-50 dark:bg-green-950/30 p-3 rounded border border-green-200 dark:border-green-800">
                    <div className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">{field}</div>
                    <div className="text-sm text-green-900 dark:text-green-100">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fields with no data found */}
          {emptyFields.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                No Data Found ({emptyFields.length} fields)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {emptyFields.map(([field]) => (
                  <div key={field} className="bg-orange-50 dark:bg-orange-950/30 p-2 rounded border border-orange-200 dark:border-orange-800 text-xs text-orange-800 dark:text-orange-200">
                    {field}
                  </div>
                ))}
              </div>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                You can manually fill in these fields after adding to the runsheet, or click "Edit Data" to modify now.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Edit3 className="h-4 w-4 mr-1" />
            Edit Data
          </Button>
          <Button variant="default" onClick={onConfirm}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Add to Next Available Row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DataVerificationDialog;