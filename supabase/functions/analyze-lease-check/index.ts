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
  
  console.log('Starting comprehensive lease chain analysis...');
  
  // Extract prospect name
  const prospect = extractProspect(lines);
  
  // Extract legal descriptions and acres
  const tracts = extractTracts(lines);
  
  // Build ownership chains for each tract
  const processedTracts = tracts.map(tract => {
    console.log(`Processing ownership chain for tract: ${tract.legalDescription}`);
    const owners = buildOwnershipChain(lines, tract.legalDescription);
    return {
      ...tract,
      owners
    };
  });

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
    unresearchedLeases: calculateUnresearchedLeases(processedTracts),
    wells,
    limitationsAndExceptions: "Analysis includes ownership chain tracking. Assumes parties who leased owned mineral interests. Tracks conveyances forward to determine current ownership status."
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

// New comprehensive ownership chain analysis
function buildOwnershipChain(lines: string[], tractDescription: string): MineralOwner[] {
  const ownershipEvents = extractOwnershipEvents(lines);
  const leaseEvents = extractLeaseEvents(lines);
  
  console.log(`Found ${ownershipEvents.length} ownership events and ${leaseEvents.length} lease events`);
  
  // Build the ownership chain by following conveyances forward
  const currentOwners = new Map<string, MineralOwner>();
  
  // Step 1: Process all lease events to establish initial ownership
  // Assumption: If someone leased, they must have owned mineral rights
  for (const lease of leaseEvents) {
    if (!currentOwners.has(lease.lessor)) {
      currentOwners.set(lease.lessor, {
        name: lease.lessor,
        address: extractAddressForPerson(lines, lease.lessor) || 'Address not found',
        vestingSource: 'Inferred from lease - lessor must have owned mineral rights',
        status: 'Leased',
        lastLease: lease,
        pughClause: extractPughClause(lines, lease.lessor),
        heldByProduction: determineHBPStatus(lease, lines),
        notes: `Original owner inferred from lease activity. Lease dated ${lease.dated}.`
      });
    }
  }
  
  // Step 2: Process conveyances to track ownership transfers
  for (const event of ownershipEvents) {
    if (event.type === 'CONVEYANCE' || event.type === 'DEED') {
      // If grantor had minerals, track them to grantee
      if (currentOwners.has(event.grantor)) {
        const originalOwner = currentOwners.get(event.grantor)!;
        
        // Create new owner entry for grantee
        currentOwners.set(event.grantee, {
          name: event.grantee,
          address: extractAddressForPerson(lines, event.grantee) || 'Address not found',
          vestingSource: `Conveyed from ${event.grantor} - ${event.documentInfo}`,
          status: determineCurrentStatus(event.grantee, leaseEvents),
          lastLease: findLatestLeaseForPerson(event.grantee, leaseEvents),
          pughClause: extractPughClause(lines, event.grantee),
          heldByProduction: originalOwner.heldByProduction, // Inherits HBP status
          notes: `Minerals conveyed from ${event.grantor}. ${event.notes || ''}`
        });
        
        // Update original owner's notes to show conveyance
        originalOwner.notes += ` Conveyed minerals to ${event.grantee} via ${event.documentInfo}.`;
      }
    }
  }
  
  // Step 3: Identify parties who received mineral conveyances but never leased
  for (const event of ownershipEvents) {
    if ((event.type === 'MINERAL_DEED' || event.notes?.toLowerCase().includes('mineral')) 
        && !currentOwners.has(event.grantee)) {
      currentOwners.set(event.grantee, {
        name: event.grantee,
        address: extractAddressForPerson(lines, event.grantee) || 'Address not found',
        vestingSource: `Mineral conveyance from ${event.grantor} - ${event.documentInfo}`,
        status: 'Open/Unleased',
        pughClause: 'No',
        heldByProduction: 'No',
        notes: `Received mineral conveyance but never leased. Assumed to own mineral interest.`
      });
    }
  }
  
  // Step 4: Check for lease expirations and update statuses
  const currentDate = new Date();
  for (const [name, owner] of currentOwners) {
    if (owner.lastLease && owner.status === 'Leased') {
      const expirationDate = new Date(owner.lastLease.expiration);
      if (expirationDate < currentDate) {
        // Check if held by production
        const productionStatus = checkProductionStatus(lines, owner.lastLease);
        owner.status = productionStatus ? 'Leased' : 'Expired (Potential HBP)';
        owner.heldByProduction = productionStatus ? 'Yes - Active production' : 'Requires verification';
        owner.notes += ` Lease expired ${owner.lastLease.expiration}. ${productionStatus ? 'Held by production.' : 'HBP status requires verification.'}`;
      }
    }
  }
  
  return Array.from(currentOwners.values());
}

interface OwnershipEvent {
  type: 'LEASE' | 'DEED' | 'CONVEYANCE' | 'MINERAL_DEED';
  grantor: string;
  grantee: string;
  date: string;
  documentInfo: string;
  notes?: string;
}

function extractOwnershipEvents(lines: string[]): OwnershipEvent[] {
  const events: OwnershipEvent[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Look for deed patterns
    if (lowerLine.includes('deed') || lowerLine.includes('convey') || lowerLine.includes('grant')) {
      const grantor = extractGrantor(line, lines, i);
      const grantee = extractGrantee(line, lines, i);
      const date = extractDateFromLine(line);
      const docInfo = extractDocumentInfo(line, lines, i);
      
      if (grantor && grantee) {
        events.push({
          type: lowerLine.includes('mineral') ? 'MINERAL_DEED' : 'DEED',
          grantor,
          grantee,
          date: date || 'Date not found',
          documentInfo: docInfo || 'Document info not found',
          notes: extractNotesFromContext(lines, i)
        });
      }
    }
  }
  
  return events;
}

function extractLeaseEvents(lines: string[]): LeaseRecord[] {
  const leases: LeaseRecord[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes('lease') || line.toLowerCase().includes('lessor')) {
      const lease = extractLeaseInfo(lines, i);
      if (lease) {
        leases.push(lease);
      }
    }
  }
  
  return leases;
}

function extractGrantor(line: string, lines: string[], index: number): string | null {
  // Look for "from" patterns or grantor indicators
  const fromMatch = line.match(/from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]*\.?)*)/i);
  if (fromMatch) return fromMatch[1];
  
  // Look in previous lines for grantor
  for (let i = Math.max(0, index - 3); i < index; i++) {
    const prevLine = lines[i];
    if (prevLine.includes('Grantor:')) {
      return prevLine.split('Grantor:')[1]?.trim() || null;
    }
  }
  
  return null;
}

function extractGrantee(line: string, lines: string[], index: number): string | null {
  // Look for "to" patterns or grantee indicators
  const toMatch = line.match(/to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]*\.?)*)/i);
  if (toMatch) return toMatch[1];
  
  // Look in following lines for grantee
  for (let i = index; i < Math.min(lines.length, index + 3); i++) {
    const nextLine = lines[i];
    if (nextLine.includes('Grantee:')) {
      return nextLine.split('Grantee:')[1]?.trim() || null;
    }
  }
  
  return null;
}

function extractDateFromLine(line: string): string | null {
  const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  return dateMatch ? dateMatch[1] : null;
}

function extractDocumentInfo(line: string, lines: string[], index: number): string | null {
  // Look for document numbers, recorded info
  const docMatch = line.match(/(Document #\d+|MD:\s*\d+|Book \d+ Page \d+)/i);
  if (docMatch) return docMatch[1];
  
  // Check surrounding lines
  for (let i = Math.max(0, index - 2); i < Math.min(lines.length, index + 3); i++) {
    const checkLine = lines[i];
    const match = checkLine.match(/(Document #\d+|MD:\s*\d+|Book \d+ Page \d+)/i);
    if (match) return match[1];
  }
  
  return null;
}

function extractAddressForPerson(lines: string[], personName: string): string | null {
  // Find the person's name and look for address in following lines
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(personName)) {
      return extractAddress(lines, i);
    }
  }
  return null;
}

function determineCurrentStatus(personName: string, leases: LeaseRecord[]): 'Leased' | 'Open/Unleased' | 'Expired (Potential HBP)' {
  const personLeases = leases.filter(lease => 
    lease.lessor.includes(personName) || lease.lessee.includes(personName)
  );
  
  if (personLeases.length === 0) return 'Open/Unleased';
  
  // Find most recent lease
  const latestLease = personLeases.reduce((latest, current) => {
    const latestDate = new Date(latest.dated);
    const currentDate = new Date(current.dated);
    return currentDate > latestDate ? current : latest;
  });
  
  const expirationDate = new Date(latestLease.expiration);
  const currentDate = new Date();
  
  if (expirationDate > currentDate) return 'Leased';
  return 'Expired (Potential HBP)';
}

function findLatestLeaseForPerson(personName: string, leases: LeaseRecord[]): LeaseRecord | undefined {
  const personLeases = leases.filter(lease => 
    lease.lessor.includes(personName) || lease.lessee.includes(personName)
  );
  
  if (personLeases.length === 0) return undefined;
  
  return personLeases.reduce((latest, current) => {
    const latestDate = new Date(latest.dated);
    const currentDate = new Date(current.dated);
    return currentDate > latestDate ? current : latest;
  });
}

function extractPughClause(lines: string[], personName: string): string {
  for (const line of lines) {
    if (line.includes(personName) && line.toLowerCase().includes('pugh')) {
      return 'Yes - Pugh clause identified';
    }
  }
  return 'No';
}

function determineHBPStatus(lease: LeaseRecord, lines: string[]): string {
  // Check for production indicators
  for (const line of lines) {
    if (line.toLowerCase().includes('production') || 
        line.toLowerCase().includes('producing') ||
        line.toLowerCase().includes('well')) {
      return 'Potentially held by production - requires verification';
    }
  }
  return 'No production indicators found';
}

function checkProductionStatus(lines: string[], lease: LeaseRecord): boolean {
  // Look for production indicators that would hold the lease
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('producing') || 
        lowerLine.includes('active production') ||
        (lowerLine.includes('well') && lowerLine.includes('active'))) {
      return true;
    }
  }
  return false;
}

function extractNotesFromContext(lines: string[], index: number): string | undefined {
  const contextLines = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2));
  const notes = contextLines.filter(line => 
    line.toLowerCase().includes('mineral') ||
    line.toLowerCase().includes('royalty') ||
    line.toLowerCase().includes('interest')
  );
  return notes.length > 0 ? notes.join('; ') : undefined;
}

function calculateUnresearchedLeases(tracts: Tract[]): number {
  let unresearched = 0;
  for (const tract of tracts) {
    for (const owner of tract.owners) {
      if (owner.notes.includes('requires verification') || 
          owner.status === 'Expired (Potential HBP)') {
        unresearched++;
      }
    }
  }
  return unresearched;
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