import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, XCircle, FileX, Info } from 'lucide-react';

interface FileUploadStatusProps {
  validFiles: File[];
  invalidFiles: Array<{ file: File; error: string }>;
  warnings: Array<{ file: File; warning: string }>;
  className?: string;
}

export const FileUploadStatus: React.FC<FileUploadStatusProps> = ({
  validFiles,
  invalidFiles,
  warnings,
  className = ''
}) => {
  if (validFiles.length === 0 && invalidFiles.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Success Messages */}
      {validFiles.length > 0 && (
        <Alert className="border-green-200 bg-green-50/50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <div className="font-semibold mb-1">
              ✅ {validFiles.length} file{validFiles.length !== 1 ? 's' : ''} ready for upload:
            </div>
            <ul className="text-sm space-y-1">
              {validFiles.map((file, index) => (
                <li key={index} className="flex items-center justify-between">
                  <span className="truncate">{file.name}</span>
                  <span className="text-xs text-green-600 ml-2">
                    {(file.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Messages */}
      {warnings.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50/50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <div className="font-semibold mb-2">
              ⚠️ Files uploaded with warnings:
            </div>
            <ul className="text-sm space-y-2">
              {warnings.map((item, index) => (
                <li key={index} className="border-l-2 border-amber-300 pl-3">
                  <div className="font-medium">{item.file.name}</div>
                  <div className="text-amber-700">{item.warning}</div>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Error Messages */}
      {invalidFiles.length > 0 && (
        <Alert variant="destructive" className="border-red-200 bg-red-50/50">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <div className="font-semibold mb-2">
              ❌ {invalidFiles.length} file{invalidFiles.length !== 1 ? 's' : ''} rejected:
            </div>
            <ul className="text-sm space-y-2">
              {invalidFiles.map((item, index) => (
                <li key={index} className="border-l-2 border-red-300 pl-3">
                  <div className="font-medium flex items-center gap-2">
                    <FileX className="h-3 w-3" />
                    {item.file.name}
                  </div>
                  <div className="text-red-700 mt-1">{item.error}</div>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* File Format Help */}
      {invalidFiles.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <div className="font-semibold mb-1">📋 Supported File Formats:</div>
            <ul className="text-sm space-y-1">
              <li><strong>Images:</strong> JPG, PNG, GIF, WebP, BMP, TIFF, SVG</li>
              <li><strong>Documents:</strong> PDF, DOC, DOCX, TXT</li>
              <li><strong>Max Size:</strong> 50MB per file</li>
            </ul>
            <div className="mt-2 text-xs text-blue-600">
              💡 <strong>Tip:</strong> For best analysis results, convert PDFs to PNG/JPG images.
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};