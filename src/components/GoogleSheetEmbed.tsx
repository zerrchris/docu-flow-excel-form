import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface GoogleSheetEmbedProps {
  defaultSheetUrl?: string;
}

const GoogleSheetEmbed: React.FC<GoogleSheetEmbedProps> = ({ defaultSheetUrl = '' }) => {
  const [sheetUrl, setSheetUrl] = useState<string>(defaultSheetUrl);
  const [embeddedUrl, setEmbeddedUrl] = useState<string>(
    defaultSheetUrl ? convertToEmbedUrl(defaultSheetUrl) : ''
  );

  // Convert a regular Google Sheet URL to an embeddable URL
  function convertToEmbedUrl(url: string): string {
    try {
      // Handle already published URLs
      if (url.includes('/pub?')) {
        return url;
      }
      
      // Handle regular share URLs
      const regex = /\/d\/([a-zA-Z0-9-_]+)/;
      const match = url.match(regex);
      
      if (match && match[1]) {
        const sheetId = match[1];
        return `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml?widget=true&headers=false`;
      }
      
      return url; // Return original if no match
    } catch (error) {
      console.error("Error converting URL:", error);
      return url;
    }
  }

  const handleEmbed = () => {
    if (sheetUrl) {
      setEmbeddedUrl(convertToEmbedUrl(sheetUrl));
    }
  };

  return (
    <Card className="p-6 mt-6">
      <div className="flex flex-col space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Google Sheet Integration</h3>
        
        <div className="flex space-x-2">
          <Input
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="Enter Google Sheet URL (must be published to web)"
            className="flex-1"
          />
          <Button onClick={handleEmbed} variant="outline">Embed</Button>
        </div>
        
        <div className="bg-muted/20 p-2 text-xs text-muted-foreground rounded-md">
          <p>To embed a Google Sheet, you must first publish it to the web:</p>
          <ol className="list-decimal pl-5 mt-1">
            <li>Open your Google Sheet</li>
            <li>Go to File → Share → Publish to web</li>
            <li>Select the sheet and click "Publish"</li>
            <li>Copy the link and paste it above</li>
          </ol>
        </div>
        
        {embeddedUrl && (
          <div className="w-full border rounded-md overflow-hidden" style={{ height: '500px' }}>
            <iframe 
              src={embeddedUrl}
              title="Embedded Google Sheet" 
              className="w-full h-full" 
              frameBorder="0"
            />
          </div>
        )}
      </div>
    </Card>
  );
};

export default GoogleSheetEmbed;