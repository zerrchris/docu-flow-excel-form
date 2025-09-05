import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { X, Plus, GripVertical, Save, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { supabase } from '@/integrations/supabase/client';

interface ColumnPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreferencesSaved?: (columns: string[], instructions: Record<string, string>) => void;
  onResetColumnWidths?: () => void;
}

const ColumnPreferencesDialog: React.FC<ColumnPreferencesDialogProps> = ({
  open,
  onOpenChange,
  onPreferencesSaved,
  onResetColumnWidths
}) => {
  const [columns, setColumns] = useState<string[]>([]);
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [newColumnName, setNewColumnName] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isGeneratingAllAI, setIsGeneratingAllAI] = useState(false);
  const { toast } = useToast();

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
      
      if (preferences && preferences.columns && preferences.columns.length > 0) {
        setColumns(preferences.columns);
        setColumnInstructions(preferences.column_instructions as Record<string, string>);
        // Select first column by default to show its instructions
        setSelectedColumn(preferences.columns[0]);
      } else {
        // Use comprehensive default columns for runsheet/title work when no preferences exist
        const defaultColumns = [
          'Inst Number',
          'Book/Page',
          'Inst Type',
          'Recording Date',
          'Document Date',
          'Grantor',
          'Grantee',
          'Legal Description',
          'Consideration',
          'Notes'
        ];
        
        // Comprehensive detailed default instructions for runsheet/title work
        const defaultInstructions: Record<string, string> = {
          'Inst Number': "Extract the instrument number exactly as it appears on the document. This is typically a sequential number assigned by the recording office (e.g., '2023-001234', 'DOC#456789'). Look for labels like 'Instrument Number', 'Document Number', or 'Rec. No.'",
          
          'Book/Page': "Extract the complete book and page reference exactly as recorded (e.g., 'Book 123, Page 456', 'Vol. 45, Pg. 678', 'B1234/P5678'). This represents the physical or digital filing location in the county records.",
          
          'Inst Type': "Extract the specific type of legal instrument. Be precise with the document type: Warranty Deed, Quit Claim Deed, Special Warranty Deed, Mortgage, Deed of Trust, Release, Assignment, Lease, Easement, Lien, Certificate of Death, Affidavit, Power of Attorney, etc. Use the exact terminology from the document.",
          
          'Recording Date': "Extract the official date when the document was recorded at the courthouse or county recorder's office. This is usually stamped or printed on the document and may appear as 'Recorded', 'Filed', or 'Rec'd'. Format as MM/DD/YYYY.",
          
          'Document Date': "Extract the date when the document was originally signed or executed by the parties. This appears in the document body and may be different from the recording date. Look for 'Dated', 'Executed', or similar language. Format as MM/DD/YYYY.",
          
          'Grantor': "Extract the full legal name(s) of the person(s) or entity transferring rights or interest. Include all grantors if multiple parties. Capture exactly as written, including titles (Mr., Mrs., Trustee, etc.), middle initials, and suffixes (Jr., Sr., III). Also include addresses if present.",
          
          'Grantee': "Extract the full legal name(s) of the person(s) or entity receiving rights or interest. Include all grantees if multiple parties. Capture exactly as written, including titles, middle initials, and suffixes. Include marital status if mentioned (single person, husband and wife, etc.) and addresses if present.",
          
          'Legal Description': "Extract the complete legal description of the property. This typically includes: Lot and Block numbers, Subdivision name, Section-Township-Range information, metes and bounds descriptions, and any other property identifiers. Capture the entire legal description verbatim as it's critical for property identification.",
          
          'Consideration': "Extract the purchase price or consideration paid for the transaction. Look for dollar amounts, 'for the sum of', 'consideration of', or similar language. Include both numerical and written amounts if present (e.g., '$50,000 (Fifty Thousand Dollars)'). Note if 'nominal consideration' like '$10.00 and other good and valuable consideration'.",
          
          'Notes': "Extract any additional important information including: special conditions, restrictions, easements, life estates, mineral rights reservations, tax information, attorney names, notary information, witness names, recording fees, or any unusual circumstances mentioned in the document. For oil and gas leases, also extract: effective date, primary term and extension/renewal options, top lease indicators, Pugh clauses (vertical/horizontal severance), pooling and unitization provisions, continuous development obligations, depth limitations, shut-in royalty provisions, royalty rate and valuation method, surface use/entry restrictions, assignment/consent requirements, savings and force majeure clauses, and termination/expiration triggers."
        };
        
        setColumns(defaultColumns);
        setColumnInstructions(defaultInstructions);
        // Select first column by default to show its instructions
        setSelectedColumn(defaultColumns[0]);
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
      // Clean up any invalid columns first
      await ExtractionPreferencesService.cleanupPreferences(columns);
      
      const success = await ExtractionPreferencesService.saveDefaultPreferences(
        columns,
        columnInstructions
      );

      if (success) {
        toast({
          title: "Preferences saved",
          description: "Your default column preferences have been updated.",
        });
        // Notify parent component that preferences were saved
        onPreferencesSaved?.(columns, columnInstructions);
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

  const resetToDefaults = () => {
    // Use comprehensive default columns for runsheet/title work
    const defaultColumns = [
      'Inst Number',
      'Book/Page', 
      'Inst Type',
      'Recording Date',
      'Document Date',
      'Grantor',
      'Grantee',
      'Legal Description',
      'Consideration',
      'Notes'
    ];
    
    // Comprehensive detailed default instructions for runsheet/title work
    const defaultInstructions: Record<string, string> = {
      'Inst Number': "Extract the instrument number exactly as it appears on the document. This is typically a sequential number assigned by the recording office (e.g., '2023-001234', 'DOC#456789'). Look for labels like 'Instrument Number', 'Document Number', or 'Rec. No.'",
      
      'Book/Page': "Extract the complete book and page reference exactly as recorded (e.g., 'Book 123, Page 456', 'Vol. 45, Pg. 678', 'B1234/P5678'). This represents the physical or digital filing location in the county records.",
      
      'Inst Type': "Extract the specific type of legal instrument. Be precise with the document type: Warranty Deed, Quit Claim Deed, Special Warranty Deed, Mortgage, Deed of Trust, Release, Assignment, Lease, Easement, Lien, Certificate of Death, Affidavit, Power of Attorney, etc. Use the exact terminology from the document.",
      
      'Recording Date': "Extract the official date when the document was recorded at the courthouse or county recorder's office. This is usually stamped or printed on the document and may appear as 'Recorded', 'Filed', or 'Rec'd'. Format as MM/DD/YYYY.",
      
      'Document Date': "Extract the date when the document was originally signed or executed by the parties. This appears in the document body and may be different from the recording date. Look for 'Dated', 'Executed', or similar language. Format as MM/DD/YYYY.",
      
      'Grantor': "Extract the full legal name(s) of the person(s) or entity transferring rights or interest. Include all grantors if multiple parties. Capture exactly as written, including titles (Mr., Mrs., Trustee, etc.), middle initials, and suffixes (Jr., Sr., III). Also include addresses if present.",
      
      'Grantee': "Extract the full legal name(s) of the person(s) or entity receiving rights or interest. Include all grantees if multiple parties. Capture exactly as written, including titles, middle initials, and suffixes. Include marital status if mentioned (single person, husband and wife, etc.) and addresses if present.",
      
      'Legal Description': "Extract the complete legal description of the property. This typically includes: Lot and Block numbers, Subdivision name, Section-Township-Range information, metes and bounds descriptions, and any other property identifiers. Capture the entire legal description verbatim as it's critical for property identification.",
      
      'Consideration': "Extract the purchase price or consideration paid for the transaction. Look for dollar amounts, 'for the sum of', 'consideration of', or similar language. Include both numerical and written amounts if present (e.g., '$50,000 (Fifty Thousand Dollars)'). Note if 'nominal consideration' like '$10.00 and other good and valuable consideration'.",
      
      'Notes': "Extract any additional important information including: special conditions, restrictions, easements, life estates, mineral rights reservations, tax information, attorney names, notary information, witness names, recording fees, or any unusual circumstances mentioned in the document. For oil and gas leases, also extract: effective date, primary term and extension/renewal options, top lease indicators, Pugh clauses (vertical/horizontal severance), pooling and unitization provisions, continuous development obligations, depth limitations, shut-in royalty provisions, royalty rate and valuation method, surface use/entry restrictions, assignment/consent requirements, savings and force majeure clauses, and termination/expiration triggers."
    };
    
    setColumns(defaultColumns);
    setColumnInstructions(defaultInstructions);
    setSelectedColumn('Inst Number'); // Select first column to show instructions
    
    toast({
      title: "Reset to defaults",
      description: "Column preferences have been reset to comprehensive defaults.",
    });
  };

  const generateAISuggestion = async (columnName: string) => {
    setIsGeneratingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-column-instructions', {
        body: { 
          columns: [columnName], 
          mode: 'single',
          columnName: columnName
        }
      });

      if (error) throw error;

      if (data.suggestions && data.suggestions[columnName]) {
        setColumnInstructions({
          ...columnInstructions,
          [columnName]: data.suggestions[columnName]
        });
        toast({
          title: "AI suggestion generated",
          description: `Generated detailed instruction for "${columnName}".`,
        });
      }
    } catch (error) {
      console.error('Error generating AI suggestion:', error);
      toast({
        title: "Error generating suggestion",
        description: "Could not generate AI suggestion. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const generateAllAISuggestions = async () => {
    setIsGeneratingAllAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-column-instructions', {
        body: { 
          columns: columns, 
          mode: 'all'
        }
      });

      if (error) throw error;

      if (data.suggestions) {
        setColumnInstructions(data.suggestions);
        toast({
          title: "AI suggestions generated",
          description: `Generated detailed instructions for all ${columns.length} columns.`,
        });
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast({
        title: "Error generating suggestions",
        description: "Could not generate AI suggestions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingAllAI(false);
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
      <DialogContent className="max-w-4xl h-[90vh] max-h-[800px] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Default Column Preferences</DialogTitle>
          <DialogDescription>
            Customize the default columns that will appear when you create a new runsheet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">{/* Content will be scrollable */}
          {/* Left Side: Column List */}
          <div className="flex-1 space-y-4 flex flex-col min-h-0">
            <div className="flex-shrink-0">
              <Label className="text-sm font-medium">Columns ({columns.length})</Label>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="space-y-2">
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
            <div className="space-y-2 flex-shrink-0">
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

            {/* AI Suggestions */}
            <div className="pt-2 border-t flex-shrink-0">
              <Button
                onClick={generateAllAISuggestions}
                disabled={isGeneratingAllAI || columns.length === 0}
                className="w-full"
                variant="outline"
              >
                <Wand2 className="h-4 w-4 mr-2" />
                {isGeneratingAllAI ? 'Generating...' : 'Let AI Suggest for All'}
              </Button>
            </div>
          </div>

          {/* Right Side: Column Instructions */}
          <div className="flex-1 space-y-4 flex flex-col min-h-0">
            {selectedColumn ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between flex-shrink-0">
                  <Label className="text-sm font-medium">
                    Instructions for "{selectedColumn}"
                  </Label>
                  <Button
                    onClick={() => generateAISuggestion(selectedColumn)}
                    disabled={isGeneratingAI}
                    size="sm"
                    variant="outline"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {isGeneratingAI ? 'Generating...' : 'Use AI Suggestion'}
                  </Button>
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  <Textarea
                    placeholder="Enter extraction instructions for this column..."
                    value={columnInstructions[selectedColumn] || ''}
                    onChange={(e) => updateColumnInstruction(selectedColumn, e.target.value)}
                    className="flex-1 min-h-[200px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-2 flex-shrink-0">
                    These instructions help the AI understand what information to extract for this column. Be as accurate and descriptive as possible to let the extraction return the results in the format you would like.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-muted rounded-lg">
                <p className="text-muted-foreground">Select a column to edit its instructions</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="flex justify-between items-center pt-4 border-t flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={resetToDefaults}
              className="text-xs border-primary text-primary hover:bg-primary/5 shadow-sm"
              aria-label="Reset column preferences to comprehensive defaults"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Columns
            </Button>
            {onResetColumnWidths && (
              <Button
                variant="outline"
                onClick={onResetColumnWidths}
                className="text-xs border-orange-500 text-orange-600 hover:bg-orange-50"
                aria-label="Reset column widths to default values"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Column Widths
              </Button>
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              These settings will apply to all new runsheets you create.
            </p>
          </div>
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