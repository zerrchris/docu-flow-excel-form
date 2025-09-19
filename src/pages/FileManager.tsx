import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Eye, Edit2, Trash2, Search, FileImage, FileSpreadsheet, Plus, ArrowUp, Home, Type } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import AuthButton from '@/components/AuthButton';
import ActiveRunsheetButton from '@/components/ActiveRunsheetButton';
import { FilePreview } from '@/components/FilePreview';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import LogoMark from '@/components/LogoMark';
import { DocumentService } from '@/services/documentService';
import { RunsheetService } from '@/services/runsheetService';

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
  const [currentView, setCurrentView] = useState<'runsheets' | 'runsheet-details'>('runsheets');
  const [currentRunsheetId, setCurrentRunsheetId] = useState<string | null>(null);
  const [currentRunsheetName, setCurrentRunsheetName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [newRunsheetName, setNewRunsheetName] = useState('');
  const [showNewRunsheetDialog, setShowNewRunsheetDialog] = useState(false);
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
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [selectedRunsheetIds, setSelectedRunsheetIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    if (currentView === 'runsheets') {
      loadRunsheets();
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
        name: doc.stored_filename || doc.original_filename,
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
      // First delete all associated documents (cascade delete)
      const deleteSuccess = await DocumentService.deleteDocumentsForRunsheet(selectedRunsheet.id);
      if (!deleteSuccess) {
        throw new Error('Failed to delete associated documents');
      }

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
        description: `"${selectedRunsheet.name}" and all associated documents have been deleted successfully.`,
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

    // Check if this file is linked to a runsheet
    if (selectedFile.rowIndex !== undefined) {
      toast({
        title: "Cannot Delete",
        description: `This document is linked to Row ${selectedFile.rowIndex + 1} of a runsheet. To delete it, first unlink it from the runsheet.`,
        variant: "destructive",
      });
      setShowDeleteDialog(false);
      setSelectedFile(null);
      return;
    }

    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Delete from database - only for unlinked files
      const { error: dbError } = await supabase
        .from('documents')
        .delete()
        .eq('id', selectedFile.id)
        .is('runsheet_id', null); // Only delete if not linked to any runsheet

      if (dbError) throw dbError;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([selectedFile.fullPath]);

      if (storageError) {
        console.warn('Storage deletion failed:', storageError);
        // Don't throw here as database record is already deleted
      }

      toast({
        title: "Success",
        description: `File "${selectedFile.name}" has been deleted.`,
      });

      setShowDeleteDialog(false);
      setSelectedFile(null);
      
      // Refresh the appropriate view
      if (currentView === 'runsheets') {
        loadRunsheets();
      } else {
        loadRunsheetDocuments(currentRunsheetId!);
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

  // Create new runsheet using unified service
  const createNewRunsheet = async () => {
    if (!newRunsheetName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your runsheet.",
        variant: "destructive",
      });
      return;
    }

    const success = await RunsheetService.createNewRunsheet(
      { name: newRunsheetName.trim() },
      navigate
    );

    if (success) {
      setShowNewRunsheetDialog(false);
      setNewRunsheetName('');
    }
  };

  // Bulk operations
  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (currentView === 'runsheets') {
        // Optimize bulk runsheet deletion with batch operations
        const runsheetIdsToDelete = Array.from(selectedRunsheetIds);
        
        if (runsheetIdsToDelete.length === 0) return;
        
        console.log(`🗑️ Starting bulk deletion of ${runsheetIdsToDelete.length} runsheets`);
        
        // Step 1: Batch delete all documents for these runsheets
        const { error: docsError } = await supabase
          .from('documents')
          .delete()
          .in('runsheet_id', runsheetIdsToDelete);
          
        if (docsError) {
          console.error('Error deleting documents in bulk:', docsError);
          throw docsError;
        }
        
        // Step 2: Batch delete all runsheets
        const { error: runsheetsError } = await supabase
          .from('runsheets')
          .delete()
          .in('id', runsheetIdsToDelete)
          .eq('user_id', user.id); // Security: only delete user's own runsheets
          
        if (runsheetsError) {
          console.error('Error deleting runsheets in bulk:', runsheetsError);
          throw runsheetsError;
        }
        
        // Step 3: Clear active runsheet if it's being deleted
        if (activeRunsheet && runsheetIdsToDelete.includes(activeRunsheet.id)) {
          clearActiveRunsheet();
        }
        
        console.log(`✅ Successfully deleted ${runsheetIdsToDelete.length} runsheets in bulk`);

        toast({
          title: "Bulk Delete Successful",
          description: `Successfully deleted ${runsheetIdsToDelete.length} runsheet(s) and their documents.`,
        });
      } else {
        // Delete files
        const filesToDelete = Array.from(selectedFileIds)
          .map(id => runsheetDocuments.find(f => f.id === id))
          .filter(Boolean) as StoredFile[];

        // Check if any files are linked to runsheets
        const linkedFiles = filesToDelete.filter(file => file.rowIndex !== undefined);
        if (linkedFiles.length > 0) {
          toast({
            title: "Cannot Delete",
            description: `${linkedFiles.length} selected document(s) are linked to runsheet rows and cannot be deleted. Please unlink them first.`,
            variant: "destructive",
          });
          setIsBulkDeleting(false);
          return;
        }

        const fileIds = filesToDelete.map(f => f.id);
        const filePaths = filesToDelete.map(f => f.fullPath);
        
        console.log(`🗑️ Starting bulk deletion of ${filesToDelete.length} files`);

        // Batch delete from database
        const { error: dbError } = await supabase
          .from('documents')
          .delete()
          .in('id', fileIds);

        if (dbError) throw dbError;

        // Batch delete from storage
        if (filePaths.length > 0) {
          const { error: storageError } = await supabase.storage
            .from('documents')
            .remove(filePaths);

          if (storageError) {
            console.warn('Some storage deletions failed:', storageError);
            // Don't throw - database cleanup succeeded which is most important
          }
        }
        
        console.log(`✅ Successfully deleted ${filesToDelete.length} files in bulk`);

        toast({
          title: "Bulk Delete Successful",
          description: `Successfully deleted ${filesToDelete.length} document(s).`,
        });
      }

      setShowBulkDeleteDialog(false);
      setSelectedFileIds(new Set());
      setSelectedRunsheetIds(new Set());
      
      // Refresh the appropriate view
      if (currentView === 'runsheets') {
        loadRunsheets();
      } else {
        loadRunsheetDocuments(currentRunsheetId!);
      }
    } catch (error: any) {
      console.error('Error in bulk delete:', error);
      toast({
        title: "Bulk Delete Failed",
        description: error.message || "Failed to delete selected items.",
        variant: "destructive",
      });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (currentView === 'runsheets') {
      setSelectedRunsheetIds(checked ? new Set(filteredRunsheets.map(r => r.id)) : new Set());
    } else {
      setSelectedFileIds(checked ? new Set(filteredDocuments.map(f => f.id)) : new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (currentView === 'runsheets') {
      const newSelected = new Set(selectedRunsheetIds);
      if (checked) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      setSelectedRunsheetIds(newSelected);
    } else {
      const newSelected = new Set(selectedFileIds);
      if (checked) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      setSelectedFileIds(newSelected);
    }
  };

  const filteredRunsheets = runsheets.filter(runsheet =>
    runsheet.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDocuments = runsheetDocuments.filter(file =>
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
            </div>
          </div>
        </div>
      </Card>

      {/* Runsheets Section */}
      <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Runsheets</h3>
            <div className="flex items-center gap-2">
              {selectedRunsheetIds.size > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={() => setShowBulkDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected ({selectedRunsheetIds.size})
                </Button>
              )}
              <Button 
                onClick={() => {
                  // Clear active runsheet and navigate to create new one
                  clearActiveRunsheet();
                  navigate('/runsheet?action=new');
                }} 
                size="sm" 
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                New Runsheet
              </Button>
            </div>
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
            <Button onClick={() => setShowNewRunsheetDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Start New Runsheet
            </Button>
          </Card>
        ) : (
          <Card>
            <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-12">
                     <Checkbox
                       checked={selectedRunsheetIds.size === filteredRunsheets.length && filteredRunsheets.length > 0}
                       onCheckedChange={handleSelectAll}
                     />
                   </TableHead>
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
                     className="hover:bg-muted/50"
                   >
                     <TableCell onClick={(e) => e.stopPropagation()}>
                       <Checkbox
                         checked={selectedRunsheetIds.has(runsheet.id)}
                         onCheckedChange={(checked) => handleSelectItem(runsheet.id, checked as boolean)}
                       />
                     </TableCell>
                     <TableCell 
                       className="font-medium cursor-pointer"
                       onClick={() => {
                         setCurrentRunsheetId(runsheet.id);
                         setCurrentRunsheetName(runsheet.name);
                         setCurrentView('runsheet-details');
                       }}
                     >
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
                            RunsheetService.openRunsheet({ runsheet }, navigate);
                          }}
                          title="Edit runsheet"
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
                          title="Rename runsheet"
                        >
                          <Type className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRunsheet(runsheet);
                            setShowDeleteDialog(true);
                          }}
                          title="Delete runsheet"
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
               {selectedFileIds.size > 0 && (
                 <Button 
                   variant="destructive" 
                   size="sm" 
                   onClick={() => setShowBulkDeleteDialog(true)}
                   className="gap-2"
                 >
                   <Trash2 className="h-4 w-4" />
                   Delete Selected ({selectedFileIds.size})
                 </Button>
               )}
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
          <Button onClick={() => RunsheetService.openRunsheet({ runsheetId: currentRunsheetId }, navigate)} className="gap-2">
            <Edit2 className="h-4 w-4" />
            Edit Runsheet
          </Button>
        </Card>
      ) : (
        <Card>
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead className="w-12">
                   <Checkbox
                     checked={selectedFileIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                     onCheckedChange={handleSelectAll}
                   />
                 </TableHead>
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
                   <TableCell onClick={(e) => e.stopPropagation()}>
                     <Checkbox
                       checked={selectedFileIds.has(file.id)}
                       onCheckedChange={(checked) => handleSelectItem(file.id, checked as boolean)}
                       disabled={file.rowIndex !== undefined}
                       title={file.rowIndex !== undefined ? `Cannot select - linked to Row ${file.rowIndex + 1}` : "Select document"}
                     />
                   </TableCell>
                   <TableCell className="font-medium">
                     <div className="flex items-center gap-2">
                       <FileImage className="h-4 w-4 text-muted-foreground" />
                       {file.name}
                     </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      Row {file.rowIndex !== undefined ? file.rowIndex + 1 : '?'}
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
                         disabled={file.rowIndex !== undefined}
                         title={file.rowIndex !== undefined ? `Cannot delete - linked to Row ${file.rowIndex + 1}` : "Delete document"}
                       >
                         <Trash2 className={`h-4 w-4 ${file.rowIndex !== undefined ? 'text-muted-foreground' : ''}`} />
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
                <span className="font-semibold text-lg">Runsheet Pro</span>
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
              <Button
                size="sm"
                onClick={() => navigate('/app')}
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
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

      {/* New Runsheet Dialog */}
      <Dialog open={showNewRunsheetDialog} onOpenChange={setShowNewRunsheetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Runsheet</DialogTitle>
            <DialogDescription>
              Enter a name for your new runsheet. This will help you organize your documents and data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="runsheet-name" className="text-sm font-medium">
                Runsheet Name
              </label>
              <Input
                id="runsheet-name"
                value={newRunsheetName}
                onChange={(e) => setNewRunsheetName(e.target.value)}
                placeholder="Enter runsheet name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newRunsheetName.trim()) {
                    createNewRunsheet();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewRunsheetDialog(false);
                setNewRunsheetName('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={createNewRunsheet}
              disabled={!newRunsheetName.trim()}
            >
              Create Runsheet
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
              {selectedFile && selectedFile.rowIndex !== undefined ? (
                <>
                  This document is linked to Row {selectedFile.rowIndex + 1} of a runsheet and cannot be deleted from here. 
                  To delete it, first unlink it from the runsheet or delete the runsheet row.
                </>
              ) : selectedFile ? (
                <>This action cannot be undone. This will permanently delete the file "{selectedFile.name}".</>
              ) : selectedRunsheet ? (
                <>This action cannot be undone. This will permanently delete the runsheet "{selectedRunsheet.name}" and all its linked documents.</>
              ) : (
                'This action cannot be undone.'
              )}
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

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Delete Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              {currentView === 'runsheets' ? (
                <>
                  This action cannot be undone. This will permanently delete {selectedRunsheetIds.size} selected runsheet(s) and all their associated documents.
                </>
              ) : (
                <>
                  This action cannot be undone. This will permanently delete {selectedFileIds.size} selected document(s).
                  {Array.from(selectedFileIds).some(id => {
                    const file = runsheetDocuments.find(f => f.id === id);
                    return file?.rowIndex !== undefined;
                  }) && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200">
                      Note: Documents linked to runsheet rows cannot be deleted and will be skipped.
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* File Preview */}
      <FilePreview 
        file={previewFile}
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setPreviewFile(null);
        }}
      />
    </div>
  );
};