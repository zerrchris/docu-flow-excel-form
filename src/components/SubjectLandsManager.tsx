import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, Plus, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface SubjectLandsTemplate {
  id: string;
  name: string;
  description?: string;
  subject_lands_text: string;
  is_default: boolean;
  created_at: string;
}

interface SubjectLandsManagerProps {
  onTemplateSelect?: (template: SubjectLandsTemplate) => void;
  compact?: boolean;
}

export const SubjectLandsManager: React.FC<SubjectLandsManagerProps> = ({ 
  onTemplateSelect, 
  compact = false 
}) => {
  const [templates, setTemplates] = useState<SubjectLandsTemplate[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SubjectLandsTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subject_lands_text: '',
    is_default: false
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_lands_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Error",
        description: "Failed to fetch subject lands templates",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.subject_lands_text.trim()) {
      toast({
        title: "Validation Error",
        description: "Name and subject lands text are required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (editingTemplate) {
        const { error } = await supabase
          .from('subject_lands_templates')
          .update(formData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Template updated successfully"
        });
      } else {
        const { error } = await supabase
          .from('subject_lands_templates')
          .insert([{ ...formData, user_id: user.id }]);

        if (error) throw error;
        toast({
          title: "Success", 
          description: "Template created successfully"
        });
      }

      fetchTemplates();
      resetForm();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving template:', error);
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('subject_lands_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Template deleted successfully"
      });
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast({
        title: "Error",
        description: "Failed to delete template",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (template: SubjectLandsTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      subject_lands_text: template.subject_lands_text,
      is_default: template.is_default
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      subject_lands_text: '',
      is_default: false
    });
  };

  const handleTemplateSelect = (template: SubjectLandsTemplate) => {
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">Quick Apply Subject Lands:</div>
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <Button
              key={template.id}
              variant="outline"
              size="sm"
              onClick={() => handleTemplateSelect(template)}
              className="text-xs"
            >
              <FileText className="w-3 h-3 mr-1" />
              {template.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Subject Lands Templates</h3>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Template name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
              <Input
                placeholder="Description (optional)"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
              <Textarea
                placeholder="Subject lands text"
                value={formData.subject_lands_text}
                onChange={(e) => setFormData(prev => ({ ...prev, subject_lands_text: e.target.value }))}
                rows={8}
                className="resize-none"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_default"
                  checked={formData.is_default}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="is_default" className="text-sm">
                  Set as default template
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {template.name}
                    {template.is_default && <Badge variant="secondary">Default</Badge>}
                  </CardTitle>
                  {template.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {template.description}
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm bg-muted p-3 rounded max-h-32 overflow-y-auto">
                {template.subject_lands_text}
              </div>
              {onTemplateSelect && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => handleTemplateSelect(template)}
                >
                  Use Template
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No subject lands templates yet. Create your first template to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};