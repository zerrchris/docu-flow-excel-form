import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeaseRecord {
  lessor: string;
  lessee: string;
  dated: string;
  term: string;
  expiration: string;
  recordedDoc: string;
}

interface MineralOwner {
  name: string;
  address: string;
  vestingSource: string;
  status: 'Leased' | 'Open/Unleased' | 'Expired (Potential HBP)';
  lastLease?: LeaseRecord;
  pughClause: string;
  heldByProduction: string;
  notes: string;
}

interface Tract {
  legalDescription: string;
  acres: number;
  owners: MineralOwner[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentText } = await req.json();

    if (!documentText) {
      return new Response(
        JSON.stringify({ error: 'Document text is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing lease check document...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get JWT token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse document and extract data
    const analysisResult = await analyzeDocument(documentText);

    // Save analysis to database
    const { data: user } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (user.user) {
      await supabase
        .from('lease_check_analyses')
        .insert({
          user_id: user.user.id,
          prospect: analysisResult.prospect,
          document_text: documentText,
          analysis_data: analysisResult
        });
    }

    console.log('Lease check analysis completed successfully');

    return new Response(
      JSON.stringify(analysisResult),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in lease check analysis:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to analyze document', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function analyzeDocument(documentText: string) {
  const lines = documentText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Extract prospect name
  const prospect = extractProspect(lines);
  
  // Extract legal descriptions and acres
  const tracts = extractTracts(lines);
  
  // Extract mineral owners and lease information
  const processedTracts = tracts.map(tract => ({
    ...tract,
    owners: extractOwnersForTract(lines, tract.legalDescription)
  }));

  // Calculate summary statistics
  const totalAcres = processedTracts.reduce((sum, tract) => sum + tract.acres, 0);
  const openInterests = processedTracts.reduce((count, tract) => 
    count + tract.owners.filter(owner => 
      owner.status === 'Open/Unleased' || owner.status === 'Expired (Potential HBP)'
    ).length, 0
  );

  const wells = extractWells(lines);
  
  return {
    prospect,
    totalAcres,
    tracts: processedTracts,
    openInterests,
    earliestExpiring: findEarliestExpiring(processedTracts),
    unresearchedLeases: 0, // Would need more sophisticated parsing
    wells,
    limitationsAndExceptions: "The information provided is limited to documents from the runsheet. Examiner cannot attest to mis-indexed or omitted info."
  };
}

function extractProspect(lines: string[]): string {
  // Look for prospect information in the first few lines
  for (const line of lines.slice(0, 10)) {
    if (line.toLowerCase().includes('prospect') || line.toLowerCase().includes('section')) {
      return line;
    }
  }
  return 'Unknown Prospect';
}

function extractTracts(lines: string[]): Tract[] {
  const tracts: Tract[] = [];
  const legalPattern = /Township\s+(\d+)\s+North,?\s+Range\s+(\d+)\s+West,?\s+Section\s+(\d+)[:\s]*(.+)/i;
  
  for (const line of lines) {
    const match = line.match(legalPattern);
    if (match) {
      const [, township, range, section, description] = match;
      const legalDescription = `Township ${township} North, Range ${range} West, Section ${section}: ${description}`;
      
      // Extract acres (look for number followed by "acres")
      const acresMatch = line.match(/(\d+(?:\.\d+)?)\s*acres?/i);
      const acres = acresMatch ? parseFloat(acresMatch[1]) : 160; // Default to 160 if not found
      
      tracts.push({
        legalDescription,
        acres,
        owners: []
      });
    }
  }
  
  return tracts;
}

function extractOwnersForTract(lines: string[], tractDescription: string): MineralOwner[] {
  const owners: MineralOwner[] = [];
  
  // This is a simplified extraction - in practice, this would need more sophisticated parsing
  // Look for patterns that indicate ownership information
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for name patterns (capitalized words)
    if (line.match(/^[A-Z][a-z]+ [A-Z][a-z]+/) && !line.includes('LEASE') && !line.includes('DEED')) {
      const name = extractName(line);
      const address = extractAddress(lines, i);
      const vestingInfo = extractVestingInfo(lines, i);
      const leaseInfo = extractLeaseInfo(lines, i);
      
      if (name) {
        owners.push({
          name,
          address: address || 'Address not found',
          vestingSource: vestingInfo || 'Vesting source not specified',
          status: leaseInfo ? 'Leased' : 'Open/Unleased',
          lastLease: leaseInfo,
          pughClause: 'No', // Would need specific parsing for Pugh clauses
          heldByProduction: leaseInfo ? 'Unknown - requires production verification' : 'No',
          notes: extractNotes(lines, i)
        });
      }
    }
  }
  
  // If no owners found, create a placeholder
  if (owners.length === 0) {
    owners.push({
      name: 'Owner information requires manual review',
      address: 'Address not found in document',
      vestingSource: 'Requires title research',
      status: 'Open/Unleased',
      pughClause: 'No',
      heldByProduction: 'Unknown - requires production verification',
      notes: 'Manual extraction required for detailed ownership information'
    });
  }
  
  return owners;
}

function extractName(line: string): string | null {
  const nameMatch = line.match(/^([A-Z][a-z]+(?: [A-Z][a-z]*\.?)+ [A-Z][a-z]+)/);
  return nameMatch ? nameMatch[1] : null;
}

function extractAddress(lines: string[], startIndex: number): string | null {
  // Look in the next few lines for address patterns
  for (let i = startIndex + 1; i < Math.min(startIndex + 5, lines.length); i++) {
    const line = lines[i];
    if (line.match(/\d+.*(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd)/i) ||
        line.match(/[A-Z]{2}\s+\d{5}/)) {
      return line;
    }
  }
  return null;
}

function extractVestingInfo(lines: string[], startIndex: number): string | null {
  for (let i = startIndex; i < Math.min(startIndex + 10, lines.length); i++) {
    const line = lines[i];
    if (line.includes('MD:') || line.includes('DEED') || line.includes('Document #')) {
      return line;
    }
  }
  return null;
}

function extractLeaseInfo(lines: string[], startIndex: number): LeaseRecord | null {
  for (let i = startIndex; i < Math.min(startIndex + 15, lines.length); i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('lease') || line.toLowerCase().includes('lessor')) {
      // Extract lease details from the surrounding lines
      const lease: Partial<LeaseRecord> = {};
      
      // Look for lessor/lessee information
      if (line.includes('Lessor:')) {
        lease.lessor = line.split('Lessor:')[1]?.trim() || '';
      }
      if (line.includes('Lessee:')) {
        lease.lessee = line.split('Lessee:')[1]?.trim() || '';
      }
      
      // Look for dates
      const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) {
        lease.dated = dateMatch[1];
        // Calculate expiration (simplified - would need term parsing)
        const date = new Date(lease.dated);
        date.setFullYear(date.getFullYear() + 3); // Default 3-year term
        lease.expiration = date.toLocaleDateString();
      }
      
      lease.term = '3 Years + 3 Years'; // Default term
      lease.recordedDoc = 'Document number not specified';
      
      if (lease.lessor || lease.lessee) {
        return lease as LeaseRecord;
      }
    }
  }
  return null;
}

function extractNotes(lines: string[], startIndex: number): string {
  const notes: string[] = [];
  
  for (let i = startIndex; i < Math.min(startIndex + 10, lines.length); i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('life estate') || 
        line.toLowerCase().includes('remainderman') ||
        line.toLowerCase().includes('trust')) {
      notes.push(line);
    }
  }
  
  return notes.join('; ') || '';
}

function extractWells(lines: string[]): string[] {
  const wells: string[] = [];
  
  for (const line of lines) {
    if (line.toLowerCase().includes('well') || 
        line.toLowerCase().includes('production') ||
        line.match(/permit\s*#/i)) {
      wells.push(line);
    }
  }
  
  return wells;
}

function findEarliestExpiring(tracts: Tract[]): string | undefined {
  let earliestDate: Date | null = null;
  let earliestLease: string | undefined;
  
  for (const tract of tracts) {
    for (const owner of tract.owners) {
      if (owner.lastLease?.expiration) {
        const expirationDate = new Date(owner.lastLease.expiration);
        if (!earliestDate || expirationDate < earliestDate) {
          earliestDate = expirationDate;
          earliestLease = `${owner.lastLease.lessee} - ${owner.lastLease.expiration}`;
        }
      }
    }
  }
  
  return earliestLease;
}