import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, X, Save, RotateCcw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

const DocumentNamingSettings: React.FC<DocumentNamingSettingsProps> = ({ availableColumns = [] }) => {
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
  const [isLoading, setIsLoading] = useState(false); // Start as false to prevent flash
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // Track if we've loaded preferences
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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Smart Document Naming Settings</CardTitle>
        <CardDescription>
          Customize how documents are automatically named based on your spreadsheet data
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Priority Columns */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Priority Columns</Label>
          <p className="text-sm text-muted-foreground">
            Columns to use for naming, in order of priority. When you click the sparkles button, documents will be named using data from these columns.
          </p>
          
          <div className="flex flex-wrap gap-2">
            {preferences.priority_columns.map((column, index) => (
              <Badge key={column} variant="secondary" className="flex items-center gap-2">
                <span>{index + 1}. {column}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removePriorityColumn(column)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
          
          <div className="flex gap-2">
            <Select value={newColumn} onValueChange={setNewColumn}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select column to add..." />
              </SelectTrigger>
              <SelectContent>
                {availableColumns
                  .filter(col => col && col.trim() !== '' && !preferences.priority_columns.includes(col))
                  .map(column => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                {availableColumns.filter(col => col && col.trim() !== '' && !preferences.priority_columns.includes(col)).length === 0 && (
                  <SelectItem value="no-columns" disabled>
                    No available columns
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button onClick={addPriorityColumn} size="sm" disabled={!newColumn}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max-parts">Max Filename Parts</Label>
            <Input
              id="max-parts"
              type="number"
              min="1"
              max="5"
              value={preferences.max_filename_parts}
              onChange={(e) => setPreferences(prev => ({
                ...prev,
                max_filename_parts: parseInt(e.target.value) || 3
              }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="separator">Separator</Label>
            <Input
              id="separator"
              value={preferences.separator}
              onChange={(e) => setPreferences(prev => ({
                ...prev,
                separator: e.target.value || '_'
              }))}
              placeholder="_"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fallback">Fallback Pattern</Label>
          <Input
            id="fallback"
            value={preferences.fallback_pattern}
            onChange={(e) => setPreferences(prev => ({
              ...prev,
              fallback_pattern: e.target.value
            }))}
            placeholder="document_{row_index}_{timestamp}"
          />
          <p className="text-sm text-muted-foreground">
            Used when no data is available. Variables: {'{row_index}'}, {'{timestamp}'}
          </p>
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
          <Label htmlFor="include-extension">Include file extension</Label>
        </div>

        <Separator />

        {/* Preview */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Preview</Label>
          <div className="bg-muted p-3 rounded text-sm space-y-3">
            <div>
              <strong>Basic Example:</strong> If your spreadsheet has data like "Acme Corp" in name column and "Invoice 2024" in title column:<br />
              <code className="bg-background px-2 py-1 rounded mt-1 inline-block">
                Acme_Corp{preferences.separator}Invoice_2024{preferences.separator}[third_column]{preferences.include_extension ? '.pdf' : ''}
              </code>
            </div>
            
            <div className="pt-2 border-t">
              <strong>Real Estate Example:</strong> For instrument number, book, and page data:<br />
              <div className="text-xs text-muted-foreground mt-1 mb-2">
                Priority columns: instrument_number, book, page | Data: "202400123", "150", "75"
              </div>
              <code className="bg-background px-2 py-1 rounded inline-block">
                202400123{preferences.separator}150{preferences.separator}75{preferences.include_extension ? '.pdf' : ''}
              </code>
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2 justify-between">
          <Button variant="outline" onClick={resetToDefaults}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
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