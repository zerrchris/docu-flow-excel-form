import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Copy, Settings } from 'lucide-react';

interface FormatTemplate {
  id: string;
  name: string;
  category: 'date' | 'legal' | 'address' | 'financial' | 'general';
  description: string;
  instruction: string;
  example: string;
}

const FORMAT_TEMPLATES: FormatTemplate[] = [
  // Date formats
  {
    id: 'date_mdy',
    name: 'MM/DD/YYYY',
    category: 'date',
    description: 'Standard US date format',
    instruction: 'Extract the date and format it as MM/DD/YYYY (e.g., 03/15/2024). If year is 2-digit, assume 20XX.',
    example: '03/15/2024'
  },
  {
    id: 'date_dmy',
    name: 'DD/MM/YYYY',
    category: 'date',
    description: 'European date format',
    instruction: 'Extract the date and format it as DD/MM/YYYY (e.g., 15/03/2024). If year is 2-digit, assume 20XX.',
    example: '15/03/2024'
  },
  {
    id: 'date_iso',
    name: 'YYYY-MM-DD',
    category: 'date',
    description: 'ISO date format',
    instruction: 'Extract the date and format it as YYYY-MM-DD (e.g., 2024-03-15). If year is 2-digit, assume 20XX.',
    example: '2024-03-15'
  },
  {
    id: 'date_written',
    name: 'Month DD, YYYY',
    category: 'date',
    description: 'Written date format',
    instruction: 'Extract the date and format it as Month DD, YYYY (e.g., March 15, 2024). Write out the full month name.',
    example: 'March 15, 2024'
  },

  // Legal descriptions
  {
    id: 'legal_metes_bounds',
    name: 'Metes & Bounds',
    category: 'legal',
    description: 'Detailed metes and bounds legal description',
    instruction: 'Extract the complete legal description including all bearings, distances, and monuments. Format as: Beginning at [point], thence [bearing] [distance] to [point], thence [bearing] [distance]... Include all calls, references to monuments, and ending with the point of beginning.',
    example: 'Beginning at the SE corner of Section 12, thence N 45°30\'15" E 1320.50 feet...'
  },
  {
    id: 'legal_lot_block',
    name: 'Lot & Block',
    category: 'legal',
    description: 'Subdivision lot and block format',
    instruction: 'Extract and format as: Lot [number], Block [number], [Subdivision Name], [City], [County], [State]. Include all relevant subdivision information.',
    example: 'Lot 15, Block 3, Meadowbrook Subdivision, Dallas, Dallas County, Texas'
  },
  {
    id: 'legal_section',
    name: 'Section/Township/Range',
    category: 'legal',
    description: 'Government survey system',
    instruction: 'Extract and format as: [Aliquot parts] Section [number], Township [number] [N/S], Range [number] [E/W], [Principal Meridian], [County], [State].',
    example: 'SW 1/4 of NE 1/4 Section 12, Township 5 North, Range 3 East, 6th Principal Meridian, Cook County, Illinois'
  },

  // Address formats
  {
    id: 'address_full',
    name: 'Full Address',
    category: 'address',
    description: 'Complete mailing address',
    instruction: 'Extract and format as: [Street Number] [Street Name], [City], [State] [ZIP Code]. Include apartment/suite numbers if present.',
    example: '123 Main Street, Suite 4B, Houston, TX 77001'
  },
  {
    id: 'address_property',
    name: 'Property Address',
    category: 'address',
    description: 'Property location without ZIP',
    instruction: 'Extract and format as: [Street Number] [Street Name], [City], [County], [State]. Focus on the physical property location.',
    example: '456 Oak Avenue, Austin, Travis County, Texas'
  },

  // Financial formats
  {
    id: 'financial_currency',
    name: 'Currency Amount',
    category: 'financial',
    description: 'Dollar amount with commas',
    instruction: 'Extract the monetary amount and format as $X,XXX.XX with proper comma separators and two decimal places. Do not include cents if the amount is a whole dollar.',
    example: '$125,500.00'
  },
  {
    id: 'financial_percentage',
    name: 'Percentage',
    category: 'financial',
    description: 'Percentage with decimal precision',
    instruction: 'Extract the percentage and format with appropriate decimal places (e.g., 7.25% or 8%). Include the % symbol.',
    example: '7.25%'
  },

  // General formats
  {
    id: 'general_phone',
    name: 'Phone Number',
    category: 'general',
    description: 'Standard US phone format',
    instruction: 'Extract and format phone numbers as (XXX) XXX-XXXX. Remove any extensions or additional numbers.',
    example: '(555) 123-4567'
  },
  {
    id: 'general_name_proper',
    name: 'Proper Name',
    category: 'general',
    description: 'Properly capitalized name',
    instruction: 'Extract the name and format with proper capitalization. First letter of each word should be capitalized, rest lowercase (except for particles like "de", "von", "van").',
    example: 'John Michael Smith Jr.'
  }
];

interface FormatTemplateSelectorProps {
  currentInstruction: string;
  onInstructionChange: (instruction: string) => void;
  fieldName?: string;
}

const FormatTemplateSelector: React.FC<FormatTemplateSelectorProps> = ({
  currentInstruction,
  onInstructionChange,
  fieldName
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [showCustom, setShowCustom] = useState(true);

  // Filter templates by relevance to field name
  const getRelevantTemplates = () => {
    if (!fieldName) return FORMAT_TEMPLATES;
    
    const fieldLower = fieldName.toLowerCase();
    const relevantTemplates = FORMAT_TEMPLATES.filter(template => {
      if (fieldLower.includes('date') || fieldLower.includes('time')) {
        return template.category === 'date';
      }
      if (fieldLower.includes('legal') || fieldLower.includes('description')) {
        return template.category === 'legal';
      }
      if (fieldLower.includes('address') || fieldLower.includes('location')) {
        return template.category === 'address';
      }
      if (fieldLower.includes('amount') || fieldLower.includes('price') || fieldLower.includes('cost') || fieldLower.includes('fee')) {
        return template.category === 'financial';
      }
      if (fieldLower.includes('phone') || fieldLower.includes('name')) {
        return template.category === 'general';
      }
      return true;
    });

    return relevantTemplates.length > 0 ? relevantTemplates : FORMAT_TEMPLATES;
  };

  const relevantTemplates = getRelevantTemplates();
  const categories = Array.from(new Set(relevantTemplates.map(t => t.category)));

  const applyTemplate = (templateId: string) => {
    const template = FORMAT_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      onInstructionChange(template.instruction);
      setSelectedTemplate(templateId);
      setShowCustom(false);
    }
  };

  const copyExample = (example: string) => {
    navigator.clipboard.writeText(example);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Format Templates</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCustom(!showCustom)}
        >
          <Settings className="h-3 w-3 mr-1" />
          {showCustom ? 'Hide Custom' : 'Show Custom'}
        </Button>
      </div>

      {/* Template Categories */}
      <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto">
        {categories.map(category => (
          <div key={category} className="space-y-2">
            <Badge variant="outline" className="text-xs">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Badge>
            <div className="grid grid-cols-1 gap-2">
              {relevantTemplates
                .filter(t => t.category === category)
                .map(template => (
                  <Card 
                    key={template.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedTemplate === template.id 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => applyTemplate(template.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{template.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {template.description}
                        </p>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-xs text-muted-foreground">Example:</span>
                          <code className="text-xs bg-muted px-1 rounded">{template.example}</code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyExample(template.example);
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>

      {showCustom && (
        <div className="border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedTemplate('');
              setShowCustom(true);
            }}
            className="text-xs"
          >
            Clear Template & Use Custom Instructions
          </Button>
        </div>
      )}
    </div>
  );
};

export default FormatTemplateSelector;