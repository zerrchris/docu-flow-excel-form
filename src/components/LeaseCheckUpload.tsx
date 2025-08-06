import React, { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LeaseCheckUploadProps {
  onDocumentUpload: (text: string) => void;
}

export const LeaseCheckUpload: React.FC<LeaseCheckUploadProps> = ({ onDocumentUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const [textInput, setTextInput] = useState('');
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFile(files[0]);
    }
  }, []);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      onDocumentUpload(text);
      toast({
        title: "File uploaded successfully",
        description: `${file.name} has been processed`,
      });
    } catch (error) {
      console.error('Error reading file:', error);
      toast({
        title: "Error",
        description: "Failed to read the file. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      onDocumentUpload(textInput);
      toast({
        title: "Text processed",
        description: "Document content has been loaded",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Runsheet Document
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-muted">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">
                  Drop your runsheet document here
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports .txt, .docx, .pdf and other text files
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>or</span>
              </div>
              <Input
                type="file"
                onChange={handleFileInput}
                accept=".txt,.docx,.pdf,.doc"
                className="max-w-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Text Input Alternative */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Or Paste Document Text
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Paste your runsheet document content here..."
            className="min-h-[200px]"
          />
          <Button 
            onClick={handleTextSubmit}
            disabled={!textInput.trim()}
            className="w-full"
          >
            Process Text
          </Button>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Document Format:</strong> Upload or paste your oil and gas runsheet document 
              containing mineral ownership and lease information.
            </p>
            <p>
              <strong>What we analyze:</strong> Mineral owners, lease status, legal descriptions, 
              vesting documents, and production status.
            </p>
            <p>
              <strong>Output:</strong> Formatted lease check report and exportable spreadsheet data 
              showing leased/unleased status for each tract and owner.
            </p>
            <p>
              <strong>Note:</strong> If production information is missing, you'll be prompted to 
              provide details about active wells and Pugh clauses.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};