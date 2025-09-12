import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, X, Save, RotateCcw, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NamingPreferences {
  id?: string;
  preference_name: string;
  priority_columns: string[];
  max_filename_parts: number;
  separator: string;
  include_extension: boolean;
  fallback_pattern: string;
  is_active: boolean;
}

interface DocumentNamingSettingsProps {
  availableColumns?: string[];
  onSave?: () => void; // Callback for when settings are saved
}

const DocumentNamingSettings: React.FC<DocumentNamingSettingsProps> = ({ availableColumns = [], onSave }) => {
  console.log('🔧 DocumentNamingSettings: Component rendering, availableColumns:', availableColumns);
  
  const [preferences, setPreferences] = useState<NamingPreferences>({
    preference_name: 'Default',
    priority_columns: ['name', 'title', 'invoice_number', 'document_number', 'reference', 'id'],
    max_filename_parts: 3,
    separator: '_',
    include_extension: true,
    fallback_pattern: 'document_{row_index}_{timestamp}',
    is_active: true,
  });
  const [newColumn, setNewColumn] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Only show loading if we haven't loaded preferences yet
    if (!hasLoadedOnce) {
      setIsLoading(true);
      loadUserPreferences();
    }
  }, [hasLoadedOnce]);

  const loadUserPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_document_naming_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading preferences:', error);
        return;
      }

      if (data && data.length > 0) {
        setPreferences(data[0]);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true); // Mark that we've loaded preferences at least once
    }
  };

  const savePreferences = async () => {
    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const dataToSave = {
        user_id: user.id,
        preference_name: preferences.preference_name,
        priority_columns: preferences.priority_columns,
        max_filename_parts: preferences.max_filename_parts,
        separator: preferences.separator,
        include_extension: preferences.include_extension,
        fallback_pattern: preferences.fallback_pattern,
        is_active: preferences.is_active,
      };

      if (preferences.id) {
        // Update existing preferences
        const { error } = await supabase
          .from('user_document_naming_preferences')
          .update(dataToSave)
          .eq('id', preferences.id);

        if (error) throw error;
      } else {
        // Create new preferences
        const { data, error } = await supabase
          .from('user_document_naming_preferences')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        setPreferences(prev => ({ ...prev, id: data.id }));
      }

      toast({
        title: "Settings saved",
        description: "Your document naming preferences have been saved.",
      });

      // Close the dialog after successful save
      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error saving settings",
        description: "There was an error saving your preferences.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setPreferences({
      preference_name: 'Default',
      priority_columns: ['name', 'title', 'invoice_number', 'document_number', 'reference', 'id'],
      max_filename_parts: 3,
      separator: '_',
      include_extension: true,
      fallback_pattern: 'document_{row_index}_{timestamp}',
      is_active: true,
    });
  };

  const addPriorityColumn = () => {
    if (newColumn.trim() && !preferences.priority_columns.includes(newColumn.trim())) {
      setPreferences(prev => ({
        ...prev,
        priority_columns: [...prev.priority_columns, newColumn.trim()]
      }));
      setNewColumn('');
    }
  };

  const removePriorityColumn = (columnToRemove: string) => {
    setPreferences(prev => ({
      ...prev,
      priority_columns: prev.priority_columns.filter(col => col !== columnToRemove)
    }));
  };

  const movePriorityColumn = (index: number, direction: 'up' | 'down') => {
    const newColumns = [...preferences.priority_columns];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newColumns.length) {
      [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
      setPreferences(prev => ({ ...prev, priority_columns: newColumns }));
    }
  };

  if (isLoading) {
    console.log('🔧 DocumentNamingSettings: Showing loading state');
    return <div className="p-4">Loading settings...</div>;
  }

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Smart Document Naming
        </CardTitle>
        <CardDescription>
          Configure how documents are automatically named based on your spreadsheet data
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Current Configuration Summary */}
        <div className="bg-muted/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Current naming pattern</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {preferences.priority_columns.slice(0, preferences.max_filename_parts).join(` ${preferences.separator} `)}
                {preferences.include_extension ? ' + file extension' : ''}
              </p>
            </div>
            <Badge variant="secondary">
              {preferences.max_filename_parts} part{preferences.max_filename_parts !== 1 ? 's' : ''} max
            </Badge>
          </div>
        </div>

        {/* Settings */}
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Customize Naming {isLoading ? '(Loading...)' : '(Using your defaults)'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4 border rounded-lg p-4">
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Select which columns to use for naming and in what order.
              </div>
              
              <div>
                <Label className="text-sm font-medium">
                  Columns to use for naming (in order, max {preferences.max_filename_parts}):
                </Label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {availableColumns.length > 0 ? availableColumns.map(column => (
                    <div key={column} className="flex items-center space-x-2">
                      <Checkbox
                        id={`column-${column}`}
                        checked={preferences.priority_columns.includes(column)}
                        disabled={!preferences.priority_columns.includes(column) && preferences.priority_columns.length >= preferences.max_filename_parts}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            if (preferences.priority_columns.length < preferences.max_filename_parts) {
                              setPreferences(prev => ({
                                ...prev,
                                priority_columns: [...prev.priority_columns, column]
                              }));
                            }
                          } else {
                            setPreferences(prev => ({
                              ...prev,
                              priority_columns: prev.priority_columns.filter(c => c !== column)
                            }));
                          }
                        }}
                      />
                      <Label 
                        htmlFor={`column-${column}`} 
                        className={`text-sm ${!preferences.priority_columns.includes(column) && preferences.priority_columns.length >= preferences.max_filename_parts ? 'text-muted-foreground' : ''}`}
                      >
                        {column}
                      </Label>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground col-span-2">
                      No columns available. Open a runsheet to see column options.
                    </p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Maximum filename parts:</Label>
                  <Select 
                    value={preferences.max_filename_parts.toString()} 
                    onValueChange={(value) => {
                      const newMaxParts = parseInt(value);
                      setPreferences(prev => ({
                        ...prev,
                        max_filename_parts: newMaxParts,
                        // Trim selected columns if they exceed the new max
                        priority_columns: prev.priority_columns.slice(0, newMaxParts)
                      }));
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 part</SelectItem>
                      <SelectItem value="2">2 parts</SelectItem>
                      <SelectItem value="3">3 parts</SelectItem>
                      <SelectItem value="4">4 parts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">Separator:</Label>
                  <Input
                    value={preferences.separator}
                    onChange={(e) => setPreferences(prev => ({
                      ...prev,
                      separator: e.target.value || '_'
                    }))}
                    placeholder="_"
                    className="mt-1"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="include-extension"
                  checked={preferences.include_extension}
                  onCheckedChange={(checked) => setPreferences(prev => ({
                    ...prev,
                    include_extension: checked
                  }))}
                />
                <Label htmlFor="include-extension" className="text-sm">Include file extension</Label>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Preview */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Preview</Label>
          <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">EXAMPLE</div>
              <div className="text-xs text-muted-foreground mb-2">
                With data: "Acme Corp", "Invoice 2024", "REF-001"
              </div>
              <code className="bg-background px-3 py-2 rounded text-sm inline-block border">
                Acme_Corp{preferences.separator}Invoice_2024{preferences.max_filename_parts > 2 ? `${preferences.separator}REF-001` : ''}{preferences.include_extension ? '.pdf' : ''}
              </code>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-between pt-4 border-t">
          <Button variant="outline" onClick={resetToDefaults}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Defaults
          </Button>
          
          <Button onClick={savePreferences} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentNamingSettings;