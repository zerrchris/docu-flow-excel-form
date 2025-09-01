import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Eye, Edit2, Trash2, Search, FileImage, FileSpreadsheet, Plus, ArrowUp, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AuthButton from '@/components/AuthButton';
import ActiveRunsheetButton from '@/components/ActiveRunsheetButton';
import { FilePreview } from '@/components/FilePreview';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import LogoMark from '@/components/LogoMark';

interface StoredFile {
  id: string;
  name: string;
  url: string;
  size: number;
  created_at: string;
  type: 'mobile' | 'uploaded';
  fullPath: string;
  rowIndex?: number;
}

interface Runsheet {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  columns: string[];
  data: Record<string, string>[];
  column_instructions: Record<string, string>;
}

export const FileManager: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeRunsheet, clearActiveRunsheet } = useActiveRunsheet();
  const [runsheets, setRunsheets] = useState<Runsheet[]>([]);
  const [runsheetDocuments, setRunsheetDocuments] = useState<StoredFile[]>([]);
  const [orphanedFiles, setOrphanedFiles] = useState<StoredFile[]>([]);
  const [currentView, setCurrentView] = useState<'runsheets' | 'runsheet-details'>('runsheets');
  const [currentRunsheetId, setCurrentRunsheetId] = useState<string | null>(null);
  const [currentRunsheetName, setCurrentRunsheetName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [selectedRunsheet, setSelectedRunsheet] = useState<Runsheet | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFile, setPreviewFile] = useState<StoredFile | null>(null);

  useEffect(() => {
    if (currentView === 'runsheets') {
      loadRunsheets();
      loadOrphanedFiles();
    } else if (currentView === 'runsheet-details' && currentRunsheetId) {
      loadRunsheetDocuments(currentRunsheetId);
    }
  }, [currentView, currentRunsheetId]);

  const loadRunsheets = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to view your runsheets.",
          variant: "destructive",
        });
        return;
      }

      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const transformedRunsheets: Runsheet[] = (data || []).map(sheet => ({
        id: sheet.id,
        name: sheet.name,
        created_at: sheet.created_at,
        updated_at: sheet.updated_at,
        columns: sheet.columns,
        data: Array.isArray(sheet.data) ? sheet.data as Record<string, string>[] : [],
        column_instructions: typeof sheet.column_instructions === 'object' && sheet.column_instructions !== null 
          ? sheet.column_instructions as Record<string, string> 
          : {}
      }));

      setRunsheets(transformedRunsheets);
    } catch (error: any) {
      console.error('Error loading runsheets:', error);
      toast({
        title: "Error",
        description: "Failed to load runsheets.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrphanedFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .is('runsheet_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const filesWithUrls = (data || []).map(doc => ({
        id: doc.id,
        name: doc.original_filename,
        url: supabase.storage.from('documents').getPublicUrl(doc.file_path).data.publicUrl,
        size: doc.file_size || 0,
        created_at: doc.created_at,
        type: 'uploaded' as const,
        fullPath: doc.file_path
      }));

      setOrphanedFiles(filesWithUrls);
    } catch (error: any) {
      console.error('Error loading orphaned files:', error);
      toast({
        title: "Error",
        description: "Failed to load orphaned files.",
        variant: "destructive",
      });
    }
  };

  const loadRunsheetDocuments = async (runsheetId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .eq('runsheet_id', runsheetId)
        .order('row_index', { ascending: true });

      if (error) throw error;

      const filesWithUrls = (data || []).map(doc => ({
        id: doc.id,
        name: doc.original_filename,
        url: supabase.storage.from('documents').getPublicUrl(doc.file_path).data.publicUrl,
        size: doc.file_size || 0,
        created_at: doc.created_at,
        type: 'uploaded' as const,
        fullPath: doc.file_path,
        rowIndex: doc.row_index
      }));

      setRunsheetDocuments(filesWithUrls);
    } catch (error: any) {
      console.error('Error loading runsheet documents:', error);
      toast({
        title: "Error",
        description: "Failed to load runsheet documents.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRunsheet = async () => {
    if (!selectedRunsheet) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('runsheets')
        .delete()
        .eq('id', selectedRunsheet.id);

      if (error) throw error;

      if (activeRunsheet && activeRunsheet.id === selectedRunsheet.id) {
        clearActiveRunsheet();
      }

      toast({
        title: "Runsheet Deleted",
        description: `"${selectedRunsheet.name}" has been deleted successfully.`,
      });

      setShowDeleteDialog(false);
      setSelectedRunsheet(null);
      loadRunsheets();
    } catch (error: any) {
      console.error('Error deleting runsheet:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete runsheet.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Delete from database
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', selectedFile.id);

      if (dbError) throw dbError;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([selectedFile.fullPath]);

      if (storageError) throw storageError;

      toast({
        title: "File Deleted",
        description: `"${selectedFile.name}" has been deleted successfully.`,
      });

      setShowDeleteDialog(false);
      setSelectedFile(null);
      
      if (currentView === 'runsheet-details' && currentRunsheetId) {
        loadRunsheetDocuments(currentRunsheetId);
      } else {
        loadOrphanedFiles();
      }
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete file.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameRunsheet = async () => {
    if (!selectedRunsheet || !newFileName.trim()) return;

    setIsRenaming(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const cleanNewName = newFileName.trim();

      const { error } = await supabase
        .from('runsheets')
        .update({ name: cleanNewName })
        .eq('id', selectedRunsheet.id)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Runsheet Renamed",
        description: `Runsheet renamed to "${cleanNewName}" successfully.`,
      });

      setShowRenameDialog(false);
      setSelectedRunsheet(null);
      setNewFileName('');
      loadRunsheets();
    } catch (error: any) {
      console.error('Error renaming runsheet:', error);
      toast({
        title: "Rename Failed",
        description: error.message || "Failed to rename runsheet.",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  const filteredRunsheets = runsheets.filter(runsheet =>
    runsheet.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDocuments = runsheetDocuments.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOrphanedFiles = orphanedFiles.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderRunsheetsView = () => (
    <div className="space-y-6">
      {/* Search and Stats */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search runsheets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{runsheets.length} runsheets</span>
              <span>•</span>
              <span>{orphanedFiles.length} orphaned files</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Runsheets Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Runsheets</h3>
          <Button onClick={() => navigate('/runsheet')} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Runsheet
          </Button>
        </div>
        
        {isLoading ? (
          <Card className="p-4">
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </Card>
        ) : filteredRunsheets.length === 0 ? (
          <Card className="p-8 text-center">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h4 className="text-lg font-medium mb-2">No runsheets found</h4>
            <p className="text-muted-foreground mb-4">
              Create your first runsheet to organize and analyze documents
            </p>
            <Button onClick={() => navigate('/runsheet')} className="gap-2">
              <Plus className="h-4 w-4" />
              Start New Runsheet
            </Button>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRunsheets.map((runsheet) => (
                  <TableRow 
                    key={runsheet.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setCurrentRunsheetId(runsheet.id);
                      setCurrentRunsheetName(runsheet.name);
                      setCurrentView('runsheet-details');
                    }}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                        {runsheet.name}
                      </div>
                    </TableCell>
                    <TableCell>{runsheet.data.length}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        View docs
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(runsheet.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/runsheet?id=${runsheet.id}`);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRunsheet(runsheet);
                            setNewFileName(runsheet.name);
                            setShowRenameDialog(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRunsheet(runsheet);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Orphaned Files Section */}
      {orphanedFiles.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Unlinked Documents</h3>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrphanedFiles.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileImage className="h-4 w-4 text-muted-foreground" />
                        {file.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(file.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPreviewFile(file);
                            setShowPreview(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedFile(file);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );

  const renderRunsheetDetailsView = () => (
    <div className="space-y-6">
      {/* Search and Stats */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{runsheetDocuments.length} documents</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Documents */}
      {filteredDocuments.length === 0 ? (
        <Card className="p-8 text-center">
          <FileImage className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h4 className="text-lg font-medium mb-2">No documents found</h4>
          <p className="text-muted-foreground mb-4">
            No documents are linked to this runsheet yet
          </p>
          <Button onClick={() => navigate(`/runsheet?id=${currentRunsheetId}`)} className="gap-2">
            <Edit2 className="h-4 w-4" />
            Edit Runsheet
          </Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileImage className="h-4 w-4 text-muted-foreground" />
                      {file.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      Row {file.rowIndex ?? '?'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(file.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPreviewFile(file);
                          setShowPreview(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedFile(file);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <LogoMark />
                <span className="font-semibold text-lg">Document Extractor</span>
              </Link>
              {currentView === 'runsheet-details' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentView('runsheets')}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Runsheets
                </Button>
              )}
              <h2 className="text-xl font-semibold">
                {currentView === 'runsheets' ? 'Runsheets & Documents' : 
                 `${currentRunsheetName} - Documents`}
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              <ActiveRunsheetButton />
              <AuthButton />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        {currentView === 'runsheets' && renderRunsheetsView()}
        {currentView === 'runsheet-details' && renderRunsheetDetailsView()}
      </div>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename Runsheet</DialogTitle>
            <DialogDescription>
              Enter a new name for this runsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="Enter new name"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameRunsheet} disabled={isRenaming || !newFileName.trim()}>
              {isRenaming ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{' '}
              {selectedFile ? `the file "${selectedFile.name}"` : 
               selectedRunsheet ? `the runsheet "${selectedRunsheet.name}"` : 'this item'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={selectedFile ? handleDeleteFile : handleDeleteRunsheet}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* File Preview */}
      <FilePreview 
        file={previewFile}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </div>
  );
};