import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { FileText, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface SubjectLandsTemplate {
  id: string;
  name: string;
  description?: string;
  subject_lands_text: string;
  is_default: boolean;
}

interface SubjectLandsQuickFillProps {
  onApplyTemplate: (text: string, templateName: string) => void;
  disabled?: boolean;
}

export const SubjectLandsQuickFill: React.FC<SubjectLandsQuickFillProps> = ({ 
  onApplyTemplate, 
  disabled = false 
}) => {
  const [templates, setTemplates] = useState<SubjectLandsTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subject_lands_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: "Error",
        description: "Failed to fetch subject lands templates",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template: SubjectLandsTemplate) => {
    onApplyTemplate(template.subject_lands_text, template.name);
    setIsOpen(false);
    toast({
      title: "Applied Template",
      description: `"${template.name}" has been applied to the Subject Lands field`
    });
  };

  if (templates.length === 0) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || loading}
          className="h-8 px-3"
        >
          <FileText className="w-4 h-4 mr-2" />
          Subject Lands
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="text-sm font-medium">Select Subject Lands Template:</div>
          
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading templates...</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-3 border rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{template.name}</span>
                        {template.is_default && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mb-2">
                          {template.description}
                        </p>
                      )}
                      <div className="text-xs bg-muted p-2 rounded max-h-20 overflow-y-auto">
                        {template.subject_lands_text.substring(0, 100)}
                        {template.subject_lands_text.length > 100 && '...'}
                      </div>
                    </div>
                    <Check className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              This will fill the Subject Lands field with your selected template.
              You can confirm or modify the text after applying.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};