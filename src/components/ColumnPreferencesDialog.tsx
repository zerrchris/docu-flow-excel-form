import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { X, Plus, GripVertical, Save } from 'lucide-react';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';

interface ColumnPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ColumnPreferencesDialog: React.FC<ColumnPreferencesDialogProps> = ({
  open,
  onOpenChange
}) => {
  const [columns, setColumns] = useState<string[]>([]);
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [newColumnName, setNewColumnName] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load current preferences when dialog opens
  useEffect(() => {
    if (open) {
      loadPreferences();
    }
  }, [open]);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const preferences = await ExtractionPreferencesService.getDefaultPreferences();
      
      if (preferences && preferences.columns && preferences.column_instructions) {
        setColumns(preferences.columns);
        setColumnInstructions(preferences.column_instructions as Record<string, string>);
      } else {
        // Use default columns if no preferences exist
        const defaultColumns = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'];
        
        // Generate instructions using the same function used in EditableSpreadsheet
        const generateDefaultInstruction = (columnName: string): string => {
          const name = columnName.toLowerCase();
          
          const suggestions: Record<string, string> = {
            'grantor': "Extract the Grantor's name as it appears on the document and include the address if there is one",
            'grantee': "Extract the Grantee's name as it appears on the document and include the address if there is one",
            'inst number': "Extract the instrument number exactly as it appears on the document",
            'instrument number': "Extract the instrument number exactly as it appears on the document",
            'book': "Extract the book number from the book/page reference",
            'page': "Extract the page number from the book/page reference",
            'book/page': "Extract the complete book and page reference (e.g., Book 123, Page 456)",
            'inst type': "Extract the type of instrument (e.g., Deed, Mortgage, Lien, etc.)",
            'instrument type': "Extract the type of instrument (e.g., Deed, Mortgage, Lien, etc.)",
            'recording date': "Extract the date when the document was recorded at the courthouse",
            'record date': "Extract the date when the document was recorded at the courthouse",
            'document date': "Extract the date the document was signed or executed",
            'execution date': "Extract the date the document was signed or executed",
            'legal description': "Extract the complete legal description of the property including lot, block, subdivision, and metes and bounds if present",
            'property description': "Extract the complete legal description of the property including lot, block, subdivision, and metes and bounds if present",
            'notes': "Extract any additional relevant information, special conditions, or remarks",
            'comments': "Extract any additional relevant information, special conditions, or remarks"
          };
          
          // Find exact match first
          if (suggestions[name]) {
            return suggestions[name];
          }
          
          // Find partial matches
          for (const [key, suggestion] of Object.entries(suggestions)) {
            if (name.includes(key) || key.includes(name)) {
              return suggestion;
            }
          }
          
          // Default suggestion
          return `Extract the ${columnName} information exactly as it appears on the document`;
        };
        
        const defaultInstructions: Record<string, string> = {};
        defaultColumns.forEach(column => {
          defaultInstructions[column] = generateDefaultInstruction(column);
        });
        
        setColumns(defaultColumns);
        setColumnInstructions(defaultInstructions);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      toast({
        title: "Error loading preferences",
        description: "Could not load your current column preferences.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addColumn = () => {
    if (newColumnName.trim() && !columns.includes(newColumnName.trim())) {
      const trimmedName = newColumnName.trim();
      setColumns([...columns, trimmedName]);
      setColumnInstructions({
        ...columnInstructions,
        [trimmedName]: `Extract ${trimmedName.toLowerCase()} information from the document`
      });
      setNewColumnName('');
      setSelectedColumn(trimmedName);
    }
  };

  const removeColumn = (columnToRemove: string) => {
    if (columns.length > 1) {
      setColumns(columns.filter(col => col !== columnToRemove));
      const newInstructions = { ...columnInstructions };
      delete newInstructions[columnToRemove];
      setColumnInstructions(newInstructions);
      if (selectedColumn === columnToRemove) {
        setSelectedColumn(null);
      }
    } else {
      toast({
        title: "Cannot remove column",
        description: "You must have at least one column.",
        variant: "destructive"
      });
    }
  };

  const updateColumnInstruction = (column: string, instruction: string) => {
    setColumnInstructions({
      ...columnInstructions,
      [column]: instruction
    });
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newColumns = [...columns];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newColumns.length) {
      [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
      setColumns(newColumns);
    }
  };

  const savePreferences = async () => {
    setIsSaving(true);
    try {
      const success = await ExtractionPreferencesService.saveDefaultPreferences(
        columns,
        columnInstructions
      );

      if (success) {
        toast({
          title: "Preferences saved",
          description: "Your default column preferences have been updated.",
        });
        onOpenChange(false);
      } else {
        throw new Error('Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error saving preferences",
        description: "Could not save your column preferences. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <p className="text-muted-foreground">Loading preferences...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Default Column Preferences</DialogTitle>
          <DialogDescription>
            Customize the default columns that will appear when you create a new runsheet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 h-full">
          {/* Left Side: Column List */}
          <div className="flex-1 space-y-4">
            <div>
              <Label className="text-sm font-medium">Columns ({columns.length})</Label>
              <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
                {columns.map((column, index) => (
                  <div
                    key={column}
                    className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${
                      selectedColumn === column ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedColumn(column)}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="outline" className="flex-1 justify-start">
                      {column}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveColumn(index, 'up');
                        }}
                        disabled={index === 0}
                        className="h-6 w-6 p-0"
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveColumn(index, 'down');
                        }}
                        disabled={index === columns.length - 1}
                        className="h-6 w-6 p-0"
                      >
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeColumn(column);
                        }}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Column */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Add New Column</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Column name"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addColumn();
                    }
                  }}
                />
                <Button onClick={addColumn} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right Side: Column Instructions */}
          <div className="flex-1 space-y-4">
            {selectedColumn ? (
              <div>
                <Label className="text-sm font-medium">
                  Instructions for "{selectedColumn}"
                </Label>
                <Textarea
                  placeholder="Enter extraction instructions for this column..."
                  value={columnInstructions[selectedColumn] || ''}
                  onChange={(e) => updateColumnInstruction(selectedColumn, e.target.value)}
                  className="mt-2 min-h-[200px]"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  These instructions help the AI understand what information to extract for this column.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-muted rounded-lg">
                <p className="text-muted-foreground">Select a column to edit its instructions</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            These settings will apply to all new runsheets you create.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={savePreferences} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ColumnPreferencesDialog;