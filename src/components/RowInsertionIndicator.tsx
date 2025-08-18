import React from 'react';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface RowInsertionIndicatorProps {
  rowIndex: number;
  isVisible: boolean;
  hasExistingData: boolean;
  className?: string;
}

export const RowInsertionIndicator: React.FC<RowInsertionIndicatorProps> = ({
  rowIndex,
  isVisible,
  hasExistingData,
  className = ''
}) => {
  if (!isVisible) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all duration-200 ${className} ${
      hasExistingData 
        ? 'bg-yellow-50 border-yellow-200 text-yellow-800' 
        : 'bg-green-50 border-green-200 text-green-800'
    }`}>
      {hasExistingData ? (
        <>
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">
            Warning: Row {rowIndex + 1} contains existing data
          </span>
        </>
      ) : (
        <>
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">
            Data will be added to empty row {rowIndex + 1}
          </span>
        </>
      )}
    </div>
  );
};

interface NextEmptyRowIndicatorProps {
  nextEmptyRowIndex: number;
  isVisible: boolean;
  onUseEmptyRow?: () => void;
  className?: string;
}

export const NextEmptyRowIndicator: React.FC<NextEmptyRowIndicatorProps> = ({
  nextEmptyRowIndex,
  isVisible,
  onUseEmptyRow,
  className = ''
}) => {
  if (!isVisible || nextEmptyRowIndex === -1) return null;

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-md border bg-blue-50 border-blue-200 text-blue-800 transition-all duration-200 ${className}`}>
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4" />
        <span className="text-sm">
          Next empty row available: Row {nextEmptyRowIndex + 1}
        </span>
      </div>
      {onUseEmptyRow && (
        <button
          onClick={onUseEmptyRow}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Use This Row
        </button>
      )}
    </div>
  );
};