import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CodeExport = () => {
  const [exportedCode, setExportedCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // List of important files to export (excluding build files, dependencies, etc.)
  const filesToExport = [
    // Core app files
    'src/App.tsx',
    'src/main.tsx',
    'src/index.css',
    'tailwind.config.ts',
    'vite.config.ts',
    'package.json',
    
    // Pages
    'src/pages/Home.tsx',
    'src/pages/Dashboard.tsx',
    'src/pages/DocumentProcessor.tsx',
    'src/pages/Settings.tsx',
    'src/pages/Admin.tsx',
    'src/pages/Analytics.tsx',
    'src/pages/App.tsx',
    'src/pages/AuthStatus.tsx',
    'src/pages/CapturePopup.tsx',
    'src/pages/FileManager.tsx',
    'src/pages/MobileCapture.tsx',
    'src/pages/NotFound.tsx',
    'src/pages/Pricing.tsx',
    'src/pages/ResetPassword.tsx',
    'src/pages/SignIn.tsx',
    'src/pages/Success.tsx',
    
    // Components
    'src/components/EditableSpreadsheet.tsx',
    'src/components/DocumentFrame.tsx',
    'src/components/DataForm.tsx',
    'src/components/DocumentUpload.tsx',
    'src/components/DocumentViewer.tsx',
    'src/components/UserDashboard.tsx',
    'src/components/AuthButton.tsx',
    'src/components/BatchProcessing.tsx',
    'src/components/AdvancedDocumentAnalysis.tsx',
    'src/components/ActiveRunsheetButton.tsx',
    'src/components/AutoSaveIndicator.tsx',
    'src/components/CapturePopup.tsx',
    'src/components/CapturedScreenshots.tsx',
    'src/components/DataInsertionValidator.tsx',
    'src/components/DataRecoveryButton.tsx',
    'src/components/DataRecoveryDialog.tsx',
    'src/components/DataValidationPrompt.tsx',
    'src/components/DataVerificationDialog.tsx',
    'src/components/DocumentLinker.tsx',
    'src/components/DocumentNamingSettings.tsx',
    'src/components/EnhancedDataVerificationDialog.tsx',
    'src/components/FilePreview.tsx',
    'src/components/FloatingCaptureWindow.tsx',
    'src/components/FullScreenDocumentWorkspace.tsx',
    'src/components/GoogleAuthCallback.tsx',
    'src/components/GoogleDrivePicker.tsx',
    'src/components/ImageCombiner.tsx',
    'src/components/InlineDocumentViewer.tsx',
    'src/components/LogoMark.tsx',
    'src/components/MobileCamera.tsx',
    'src/components/MobileCapturedDocuments.tsx',
    'src/components/MultipleFileUpload.tsx',
    'src/components/OpenRunsheetDialog.tsx',
    'src/components/PDFViewer.tsx',
    'src/components/ProductionModal.tsx',
    'src/components/ProgressIndicator.tsx',
    'src/components/ReExtractDialog.tsx',
    'src/components/RealtimeVoiceInput.tsx',
    'src/components/RoleGuard.tsx',
    'src/components/RowByRowAnalysis.tsx',
    'src/components/RowInsertionIndicator.tsx',
    'src/components/RunsheetFileUpload.tsx',
    'src/components/RunsheetSelectionDialog.tsx',
    'src/components/ScreenshotCapture.tsx',
    'src/components/ScreenshotSession.tsx',
    'src/components/StorageDebugDialog.tsx',
    'src/components/SubscriptionGuard.tsx',
    'src/components/SyncStatusBadge.tsx',
    'src/components/ViewportPortal.tsx',
    'src/components/VoiceInput.tsx',
    'src/components/AIUsageAnalytics.tsx',
    'src/components/AreaSelector.tsx',
    'src/components/BatchDocumentRow.tsx',
    'src/components/ColumnPreferencesDialog.tsx',
    
    // Hooks
    'src/hooks/useAutoSave.ts',
    'src/hooks/useActiveRunsheet.ts',
    'src/hooks/use-mobile.tsx',
    'src/hooks/use-toast.ts',
    
    // Utils and services
    'src/lib/utils.ts',
    'src/utils/fileStorage.ts',
    'src/utils/fileValidation.ts',
    'src/utils/imageCombiner.ts',
    'src/utils/offlineStorage.ts',
    'src/utils/pdfToImage.ts',
    'src/utils/rowValidation.ts',
    'src/utils/screenCapture.ts',
    'src/utils/syncService.ts',
    'src/services/adminSettings.ts',
    'src/services/columnWidthPreferences.ts',
    'src/services/documentService.ts',
    'src/services/extractionPreferences.ts',
    'src/services/storageDebugService.ts',
    'src/contexts/SubscriptionContext.tsx',
    
    // Supabase integration
    'src/integrations/supabase/client.ts',
  ];

  const exportCode = async () => {
    setIsLoading(true);
    try {
      let codeString = '=== PROJECT CODE EXPORT ===\n\n';
      
      for (const filePath of filesToExport) {
        try {
          const response = await fetch(`/${filePath}`);
          if (response.ok) {
            const content = await response.text();
            codeString += `\n\n=== ${filePath} ===\n\n`;
            codeString += content;
          }
        } catch (error) {
          console.log(`Could not fetch ${filePath}:`, error);
          // Continue with other files
        }
      }
      
      setExportedCode(codeString);
      toast({
        title: "Code exported successfully",
        description: "All code files have been compiled into the text area below.",
      });
    } catch (error) {
      console.error('Error exporting code:', error);
      toast({
        title: "Export failed",
        description: "There was an error exporting the code.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportedCode);
      toast({
        title: "Copied to clipboard",
        description: "All code has been copied to your clipboard.",
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard. Try selecting all text and copying manually.",
        variant: "destructive",
      });
    }
  };

  const downloadAsFile = () => {
    const blob = new Blob([exportedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-code-export-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download started",
      description: "Code export file is being downloaded.",
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Code Export Utility
          </CardTitle>
          <p className="text-muted-foreground">
            Export all your project code into a single copyable string. This includes all React components, 
            hooks, utilities, and configuration files.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={exportCode} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? 'Exporting...' : 'Export All Code'}
            </Button>
            
            {exportedCode && (
              <>
                <Button 
                  variant="outline" 
                  onClick={copyToClipboard}
                  className="flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Copy to Clipboard
                </Button>
                <Button 
                  variant="outline" 
                  onClick={downloadAsFile}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download as File
                </Button>
              </>
            )}
          </div>
          
          {exportedCode && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Exported Code ({(exportedCode.length / 1024).toFixed(1)}KB):
              </label>
              <Textarea
                value={exportedCode}
                readOnly
                className="min-h-[400px] font-mono text-xs"
                placeholder="Click 'Export All Code' to generate the code export..."
              />
              <p className="text-xs text-muted-foreground">
                The code above includes all your React components, hooks, utilities, and configuration files. 
                You can copy this text and use it to recreate your project or share it with others.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CodeExport;