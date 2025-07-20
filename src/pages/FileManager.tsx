import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Eye, Edit2, Trash2, Search, Calendar, FileImage, Smartphone, Upload as UploadIcon, Download, CheckSquare, X, ChevronDown, ChevronRight, Folder, FolderOpen, FileSpreadsheet, ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StoredFile {
  id: string;
  name: string;
  url: string;
  size: number;
  created_at: string;
  type: 'mobile' | 'uploaded';
  project?: string;
  fullPath: string;
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

interface ProjectGroup {
  name: string;
  files: StoredFile[];
  count: number;
}

export const FileManager: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [runsheets, setRunsheets] = useState<Runsheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [selectedRunsheet, setSelectedRunsheet] = useState<Runsheet | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<'root' | 'projects' | 'runsheets'>('root');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentFolder === 'projects') {
      loadStoredFiles();
    } else if (currentFolder === 'runsheets') {
      loadRunsheets();
    }
  }, [currentFolder]);

  const loadStoredFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to view your files.",
          variant: "destructive",
        });
        return;
      }

      setIsLoading(true);
      
      // Get all files recursively to handle project folders
      const getAllFiles = async (path = '') => {
        const { data, error } = await supabase.storage
          .from('documents')
          .list(`${user.id}${path}`, {
            limit: 100,
            sortBy: { column: 'created_at', order: 'desc' }
          });
        
        if (error) throw error;
        
        let allFiles: any[] = [];
        
        for (const item of data || []) {
          if (item.id === null) {
            // This is a folder, recursively get its contents
            const subFiles = await getAllFiles(`${path}/${item.name}`);
            allFiles = allFiles.concat(subFiles);
          } else {
            // This is a file
            allFiles.push({
              ...item,
              fullPath: `${path}/${item.name}`.replace(/^\//, ''),
              project: path ? path.split('/').pop() : undefined
            });
          }
        }
        
        return allFiles;
      };

      const allFiles = await getAllFiles();

      const filesWithUrls = allFiles.map(file => {
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(`${user.id}/${file.fullPath}`);

        return {
          id: file.id || file.name,
          name: file.name,
          url: urlData.publicUrl,
          size: file.metadata?.size || 0,
          created_at: file.created_at || new Date().toISOString(),
          type: file.name.startsWith('mobile_document') ? 'mobile' as const : 'uploaded' as const,
          project: file.project,
          fullPath: file.fullPath
        };
      });

      setFiles(filesWithUrls);
    } catch (error: any) {
      console.error('Error loading files:', error);
      toast({
        title: "Error",
        description: "Failed to load stored files.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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

      // Transform the data to match our Runsheet interface
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

  const handleRename = async () => {
    if (!selectedFile || !newFileName.trim()) return;

    setIsRenaming(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get the file extension
      const fileExtension = selectedFile.name.split('.').pop();
      const cleanNewName = newFileName.trim().replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_');
      const newFullName = `${cleanNewName}.${fileExtension}`;

      // Move the file to the new name
      const { error } = await supabase.storage
        .from('documents')
        .move(`${user.id}/${selectedFile.fullPath}`, `${user.id}/${newFullName}`);

      if (error) throw error;

      toast({
        title: "File Renamed",
        description: `File renamed to "${newFullName}" successfully.`,
      });

      setShowRenameDialog(false);
      setSelectedFile(null);
      setNewFileName('');
      loadStoredFiles(); // Refresh the list
    } catch (error: any) {
      console.error('Error renaming file:', error);
      toast({
        title: "Rename Failed",
        description: error.message || "Failed to rename file.",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (currentFolder === 'projects' && selectedFile) {
      await handleDeleteFile();
    } else if (currentFolder === 'runsheets' && selectedRunsheet) {
      await handleDeleteRunsheet();
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;

    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.storage
        .from('documents')
        .remove([`${user.id}/${selectedFile.fullPath}`]);

      if (error) throw error;

      toast({
        title: "File Deleted",
        description: `"${selectedFile.name}" has been deleted successfully.`,
      });

      setShowDeleteDialog(false);
      setSelectedFile(null);
      loadStoredFiles(); // Refresh the list
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

  const handleDeleteRunsheet = async () => {
    if (!selectedRunsheet) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('runsheets')
        .delete()
        .eq('id', selectedRunsheet.id);

      if (error) throw error;

      toast({
        title: "Runsheet Deleted",
        description: `"${selectedRunsheet.name}" has been deleted successfully.`,
      });

      setShowDeleteDialog(false);
      setSelectedRunsheet(null);
      loadRunsheets(); // Refresh the list
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

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    
    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (currentFolder === 'projects') {
        // Get paths of selected files
        const selectedFilePaths = files
          .filter(file => selectedFiles.has(file.id))
          .map(file => `${user.id}/${file.fullPath}`);
        
        const { error } = await supabase.storage
          .from('documents')
          .remove(selectedFilePaths);

        if (error) throw error;
      } else if (currentFolder === 'runsheets') {
        // Delete selected runsheets
        const selectedRunsheetIds = Array.from(selectedFiles);
        
        const { error } = await supabase
          .from('runsheets')
          .delete()
          .in('id', selectedRunsheetIds);

        if (error) throw error;
      }

      toast({
        title: "Items Deleted",
        description: `Successfully deleted ${selectedFiles.size} items.`,
      });

      setSelectedFiles(new Set());
      setIsSelectMode(false);
      
      if (currentFolder === 'projects') {
        loadStoredFiles();
      } else if (currentFolder === 'runsheets') {
        loadRunsheets();
      }
    } catch (error: any) {
      console.error('Error deleting selected items:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete selected items.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedFiles.size === 0) return;
    
    if (currentFolder === 'projects') {
      const selectedFileList = files.filter(file => selectedFiles.has(file.id));
      
      for (const file of selectedFileList) {
        try {
          const response = await fetch(file.url);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } catch (error) {
          console.error(`Error downloading ${file.name}:`, error);
        }
      }
    } else if (currentFolder === 'runsheets') {
      // Download runsheets as Excel files
      const selectedRunsheetList = runsheets.filter(sheet => selectedFiles.has(sheet.id));
      
      for (const sheet of selectedRunsheetList) {
        try {
          // Here you would implement Excel export
          // For now, just download as JSON
          const dataStr = JSON.stringify(sheet, null, 2);
          const dataBlob = new Blob([dataStr], { type: 'application/json' });
          const url = window.URL.createObjectURL(dataBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${sheet.name}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } catch (error) {
          console.error(`Error downloading ${sheet.name}:`, error);
        }
      }
    }
    
    toast({
      title: "Downloads Started",
      description: `Started downloading ${selectedFiles.size} items.`,
    });
  };

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedFiles(new Set());
  };

  const selectAllItems = () => {
    const currentItems = currentFolder === 'projects' ? filteredFiles : filteredRunsheets;
    if (selectedFiles.size === currentItems.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(currentItems.map(item => item.id)));
    }
  };

  const toggleFileSelection = (fileId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const toggleProjectExpansion = (projectName: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(projectName)) {
      newExpanded.delete(projectName);
    } else {
      newExpanded.add(projectName);
    }
    setExpandedProjects(newExpanded);
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRunsheets = runsheets.filter(sheet =>
    sheet.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group files by project
  const groupedFiles = React.useMemo(() => {
    const groups: { [key: string]: StoredFile[] } = {};
    
    filteredFiles.forEach(file => {
      const projectName = file.project || 'Individual Files';
      if (!groups[projectName]) {
        groups[projectName] = [];
      }
      groups[projectName].push(file);
    });

    return groups;
  }, [filteredFiles]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    const MB = bytes / (1024 * 1024);
    return MB > 1 ? `${MB.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openRenameDialog = (file: StoredFile) => {
    setSelectedFile(file);
    // Remove file extension for editing
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    setNewFileName(nameWithoutExt);
    setShowRenameDialog(true);
  };

  const openDeleteDialog = (file?: StoredFile, runsheet?: Runsheet) => {
    if (file) {
      setSelectedFile(file);
      setSelectedRunsheet(null);
    } else if (runsheet) {
      setSelectedRunsheet(runsheet);
      setSelectedFile(null);
    }
    setShowDeleteDialog(true);
  };

  const renderFileCard = (file: StoredFile) => (
    <Card key={file.id} className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* File Preview */}
        <div className="relative w-full h-32 bg-muted rounded overflow-hidden">
          <img
            src={file.url}
            alt={file.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {/* File Info */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm truncate flex-1" title={file.name}>
              {file.name}
            </h3>
            <Badge variant={file.type === 'mobile' ? 'default' : 'secondary'} className="text-xs">
              {file.type === 'mobile' ? (
                <><Smartphone className="h-3 w-3 mr-1" /> Mobile</>
              ) : (
                <><UploadIcon className="h-3 w-3 mr-1" /> Upload</>
              )}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(file.created_at)}</span>
            <span>•</span>
            <span>{formatFileSize(file.size)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isSelectMode ? (
            <Button
              variant={selectedFiles.has(file.id) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFileSelection(file.id)}
              className="flex-1"
            >
              {selectedFiles.has(file.id) ? '✓ Selected' : 'Select'}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(file.url, '_blank')}
                className="flex-1 gap-2"
              >
                <Eye className="h-3 w-3" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openRenameDialog(file)}
                className="gap-2"
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDeleteDialog(file)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );

  const renderRunsheetCard = (runsheet: Runsheet) => (
    <Card key={runsheet.id} className="p-4 hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Runsheet Preview */}
        <div className="relative w-full h-32 bg-muted rounded overflow-hidden flex items-center justify-center">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
        </div>

        {/* Runsheet Info */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm truncate flex-1" title={runsheet.name}>
              {runsheet.name}
            </h3>
            <Badge variant="default" className="text-xs">
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              Runsheet
            </Badge>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(runsheet.updated_at)}</span>
            <span>•</span>
            <span>{runsheet.data.length} rows</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isSelectMode ? (
            <Button
              variant={selectedFiles.has(runsheet.id) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleFileSelection(runsheet.id)}
              className="flex-1"
            >
              {selectedFiles.has(runsheet.id) ? '✓ Selected' : 'Select'}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/runsheet?runsheet=${runsheet.id}`)}
                className="flex-1 gap-2"
              >
                <Eye className="h-3 w-3" />
                Open
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDeleteDialog(undefined, runsheet)}
                className="gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );

  const renderRootView = () => (
    <div className="space-y-6">
      <Card className="p-8 text-center">
        <Folder className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-medium mb-2">File Manager</h3>
        <p className="text-muted-foreground mb-6">
          Organize and manage your documents and runsheets
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto">
          <Card 
            className="p-6 cursor-pointer hover:shadow-md transition-shadow border-primary/20 hover:border-primary/40"
            onClick={() => setCurrentFolder('projects')}
          >
            <Folder className="h-8 w-8 mx-auto mb-3 text-primary" />
            <h4 className="font-medium mb-2">Projects</h4>
            <p className="text-sm text-muted-foreground">
              Documents organized by project
            </p>
          </Card>
          <Card 
            className="p-6 cursor-pointer hover:shadow-md transition-shadow border-primary/20 hover:border-primary/40"
            onClick={() => setCurrentFolder('runsheets')}
          >
            <FileSpreadsheet className="h-8 w-8 mx-auto mb-3 text-primary" />
            <h4 className="font-medium mb-2">Run Sheets</h4>
            <p className="text-sm text-muted-foreground">
              Saved spreadsheet data
            </p>
          </Card>
        </div>
      </Card>
    </div>
  );

  const renderProjectsView = () => (
    <div className="space-y-6">
      {/* Search and Stats */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{files.length} total files</span>
            <span>•</span>
            <span>{files.filter(f => f.type === 'mobile').length} mobile captured</span>
            <span>•</span>
            <span>{files.filter(f => f.type === 'uploaded').length} uploaded</span>
          </div>
        </div>
      </Card>

      {/* Files Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="space-y-3">
                <div className="w-full h-32 bg-muted rounded"></div>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      ) : filteredFiles.length === 0 ? (
        <Card className="p-8 text-center">
          <FileImage className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">
            {searchTerm ? 'No files found' : 'No stored files'}
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm 
              ? 'Try adjusting your search terms'
              : 'Upload documents or use Mobile Capture to get started'
            }
          </p>
          {!searchTerm && (
            <Button onClick={() => navigate('/mobile-capture')} className="gap-2">
              <Smartphone className="h-4 w-4" />
              Go to Mobile Capture
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedFiles).map(([projectName, projectFiles]) => (
            <Card key={projectName} className="overflow-hidden">
              <Collapsible
                open={expandedProjects.has(projectName)}
                onOpenChange={() => toggleProjectExpansion(projectName)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      {expandedProjects.has(projectName) ? (
                        <FolderOpen className="h-5 w-5 text-primary" />
                      ) : (
                        <Folder className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <h3 className="font-medium">{projectName}</h3>
                        <p className="text-sm text-muted-foreground">
                          {projectFiles.length} file{projectFiles.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    {expandedProjects.has(projectName) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-4 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {projectFiles.map(renderFileCard)}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderRunsheetsView = () => (
    <div className="space-y-6">
      {/* Search and Stats */}
      <Card className="p-4">
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
            <span>{runsheets.length} total runsheets</span>
            <span>•</span>
            <span>{runsheets.reduce((acc, sheet) => acc + sheet.data.length, 0)} total rows</span>
          </div>
        </div>
      </Card>

      {/* Runsheets Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="space-y-3">
                <div className="w-full h-32 bg-muted rounded"></div>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </Card>
          ))}
        </div>
      ) : filteredRunsheets.length === 0 ? (
        <Card className="p-8 text-center">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">
            {searchTerm ? 'No runsheets found' : 'No saved runsheets'}
          </h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm 
              ? 'Try adjusting your search terms'
              : 'Process some documents to create runsheets'
            }
          </p>
          {!searchTerm && (
            <Button onClick={() => navigate('/document-processor')} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Go to Document Processor
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRunsheets.map(renderRunsheetCard)}
        </div>
      )}
    </div>
  );

  const currentItems = currentFolder === 'projects' ? filteredFiles : 
                      currentFolder === 'runsheets' ? filteredRunsheets : [];

  const refreshCurrentFolder = () => {
    if (currentFolder === 'projects') {
      loadStoredFiles();
    } else if (currentFolder === 'runsheets') {
      loadRunsheets();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {currentFolder === 'root' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/app')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to App
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCurrentFolder('root');
                  setSearchTerm('');
                  setSelectedFiles(new Set());
                  setIsSelectMode(false);
                }}
                className="gap-2"
              >
                <ArrowUp className="h-4 w-4" />
                Back to File Manager
              </Button>
            )}
            <h1 className="text-xl font-semibold">
              {currentFolder === 'root' ? 'File Manager' :
               currentFolder === 'projects' ? 'Projects' : 'Run Sheets'}
            </h1>
          </div>
          
          {currentFolder !== 'root' && (
            <div className="flex gap-2">
              {isSelectMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSelectMode(false)}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllItems}
                    disabled={currentItems.length === 0}
                    className="gap-2"
                  >
                    <CheckSquare className="h-4 w-4" />
                    {selectedFiles.size === currentItems.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedFiles.size > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadSelected}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Download ({selectedFiles.size})
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteSelected}
                        disabled={isDeleting}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? 'Deleting...' : `Delete (${selectedFiles.size})`}
                      </Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSelectMode}
                    disabled={currentItems.length === 0}
                    className="gap-2"
                  >
                    <CheckSquare className="h-4 w-4" />
                    Select
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshCurrentFolder}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading...' : 'Refresh'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto p-4">
        {currentFolder === 'root' && renderRootView()}
        {currentFolder === 'projects' && renderProjectsView()}
        {currentFolder === 'runsheets' && renderRunsheetsView()}
      </div>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>
              Enter a new name for "{selectedFile?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Enter new file name..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isRenaming || !newFileName.trim()}>
              {isRenaming ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedFile ? 'File' : 'Runsheet'}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedFile?.name || selectedRunsheet?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};