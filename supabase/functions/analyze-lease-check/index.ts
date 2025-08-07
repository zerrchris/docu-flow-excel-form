// Enhanced lease check analyzer v2.0 - Force deployment
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RunsheetRow {
  'Book and Page': string;
  'Instrument Number': string;
  'Instrument Type': string;
  'Dated': string;
  'Recorded': string;
  'Grantor(s)': string;
  'Grantee(s)': string;
  'Description': string;
  'Comments': string;
}

interface LeaseDetails {
  lessor: string;
  lessee: string;
  dated: string;
  term: string;
  expiration: string;
  recorded: string;
  documentNumber: string;
}

interface MineralOwner {
  name: string;
  interests: string;
  netAcres: number;
  leaseholdStatus: string;
  lastLeaseOfRecord?: LeaseDetails;
  landsConveredOnLease?: string[];
  listedAcreage?: string;
}

interface TractData {
  tractId: string;
  legalDescription: string;
  totalAcres: number | string;
  grossAcreageNote?: string;
  needsManualAcres?: boolean;
  owners: MineralOwner[];
  wells?: string[];
  limitationsAndExceptions: string;
}

interface LeaseCheckResponse {
  prospect: string;
  reportFormat: string;
  hasMultipleTracts: boolean;
  tracts: TractData[];
  overallLimitationsAndExceptions?: string;
}

interface StructuredLeaseCheckResult {
  prospect: string;
  totalAcres: number;
  reportFormat: string;
  owners: MineralOwner[];
  wells: string[];
  limitationsAndExceptions: string;
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

    console.log('Processing runsheet document with enhanced AI analysis...');

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

    // Simplified approach: Use AI analysis for all documents
    console.log('Using enhanced AI-first analysis approach with v2.0 interactive system...');
    console.log(`Document preview: ${documentText.substring(0, 300)}...`);
    
    let analysisResult;
    
    try {
      // Try AI analysis first - it's more flexible and reliable
      analysisResult = await analyzeWithAI(documentText);
      
      // Only use structured parsing as a fallback if AI fails completely
      if (!analysisResult || analysisResult.owners[0]?.name?.includes('Analysis Error')) {
        console.log('AI analysis failed, trying structured parsing as fallback...');
        
        const isStructuredData = documentText.includes('|') || documentText.includes('ROW');
        if (isStructuredData) {
          analysisResult = analyzeStructuredRunsheet(documentText);
        }
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      
      // Try structured parsing as last resort
      try {
        console.log('Attempting structured parsing as final fallback...');
        analysisResult = analyzeStructuredRunsheet(documentText);
      } catch (structuredError) {
        console.error('All analysis methods failed:', structuredError);
        analysisResult = {
          prospect: "Analysis Failed",
          totalAcres: 0,
          reportFormat: "error",
          owners: [{
            name: "Upload Error - Please contact support",
            interests: "100.00000000%",
            netAcres: 0,
            leaseholdStatus: "System Error",
            lastLeaseOfRecord: undefined,
            listedAcreage: "0.0000000 mi"
          }],
          wells: ["Analysis system error"],
          limitationsAndExceptions: "System could not process document. Please contact support."
        };
      }
    }

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

    console.log('Analysis completed successfully');

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

function analyzeStructuredRunsheet(documentText: string): StructuredLeaseCheckResult {
  console.log('Analyzing structured runsheet data with expert mineral rights methodology...');
  
  // Parse the structured runsheet data
  const rows = parseRunsheetRows(documentText);
  
  // Extract prospect information and identify subdivided tracts
  const prospectInfo = extractProspectInfo(rows, documentText);
  const subdivisions = parseSubdivisions(prospectInfo.legalDescription);
  
  console.log(`Processing ${subdivisions.length} subdivision(s) as distinct entries`);
  
  // Build ownership chain using expert mineral rights analysis
  const currentOwners = buildExpertOwnershipChain(rows, prospectInfo.legalDescription, subdivisions);
  
  // Prompt for production information if needed
  const needsProductionData = currentOwners.some(owner => 
    owner.leaseholdStatus === 'Expired (Potential HBP)' || 
    (owner.lastLeaseOfRecord && !owner.lastLeaseOfRecord.expiration.includes('Unknown'))
  );
  
  return {
    prospect: prospectInfo.description,
    totalAcres: prospectInfo.acres,
    reportFormat: "structured",
    owners: currentOwners,
    wells: extractWellInformation(rows),
    limitationsAndExceptions: generateExpertLimitationsAndExceptions(rows),
    needsProductionData
  };
}

function parseRunsheetRows(documentText: string): RunsheetRow[] {
  const lines = documentText.split('\n');
  const rows: RunsheetRow[] = [];
  
  let headers: string[] = [];
  
  console.log(`Parsing document with ${lines.length} lines`);
  
  // Try to find headers in different formats
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    
    if (line.includes('ROW 1:')) {
      headers = line.replace('ROW 1: ', '').split(' | ');
      console.log(`Found ROW 1 headers: ${JSON.stringify(headers)}`);
      break;
    } else if (line.includes('Book and Page') && line.includes('|')) {
      headers = line.split(' | ').map(h => h.trim());
      console.log(`Found pipe-separated headers: ${JSON.stringify(headers)}`);
      break;
    } else if (line.includes('Book and Page') && line.includes('\t')) {
      headers = line.split('\t').map(h => h.trim());
      console.log(`Found tab-separated headers: ${JSON.stringify(headers)}`);
      break;
    }
  }
  
  if (headers.length === 0) {
    console.log('No headers found, using default headers');
    headers = ['Book and Page', 'Instrument Number', 'Instrument Type', 'Dated', 'Recorded', 'Grantor(s)', 'Grantee(s)', 'Description', 'Comments'];
  }
  
  // Parse data rows
  for (const line of lines) {
    if (line.includes('ROW ') && !line.includes('ROW 1:')) {
      const rowDataText = line.substring(line.indexOf(': ') + 2);
      const rowData = rowDataText.split(' | ').map(cell => {
        // Restore line breaks that were preserved during Excel processing
        return cell.replace(/\|\|NEWLINE\|\|/g, '\n').trim();
      });
      
      console.log(`Processing ROW data: ${line.substring(0, 30)}...`);
      
      if (rowData.length > 0) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header.trim()] = rowData[index] || '';
        });
        rows.push(row as RunsheetRow);
        console.log(`Added row: ${row['Instrument Type']} - ${row['Grantor(s)']} to ${row['Grantee(s)']}`);
      }
    } else if (!line.includes('ROW ') && line.includes('|') && headers.length > 0) {
      // Try to parse as direct pipe-separated data
      const rowData = line.split(' | ').map(cell => {
        return cell.replace(/\|\|NEWLINE\|\|/g, '\n').trim();
      });
      
      if (rowData.length >= headers.length - 2) { // Allow some flexibility
        const row: any = {};
        headers.forEach((header, index) => {
          row[header.trim()] = rowData[index] || '';
        });
        
        // Only add if it looks like actual data (not header row)
        if (row['Instrument Type'] && row['Instrument Type'] !== 'Instrument Type') {
          rows.push(row as RunsheetRow);
          console.log(`Added direct row: ${row['Instrument Type']} - ${row['Grantor(s)']} to ${row['Grantee(s)']}`);
        }
      }
    }
  }
  
  console.log(`Parsed ${rows.length} total rows`);
  return rows;
}

function extractProspectInfo(rows: RunsheetRow[], documentText: string): { description: string; acres: number; legalDescription: string } {
  const filenameLine = documentText.split('\n').find(line => line.includes('EXCEL FILE:'));
  
  if (filenameLine) {
    const filename = filenameLine.replace('EXCEL FILE: ', '');
    // Extract legal description from filename like "55209OR-158N-102W-Sec. 18-E2NE"
    const legalMatch = filename.match(/(\d+N-\d+W-Sec\.\s*\d+[^(]*)/);
    if (legalMatch) {
      const legal = legalMatch[1].trim();
      return {
        description: legal,
        acres: calculateAcresFromDescription(legal),
        legalDescription: legal
      };
    }
  }
  
  // Fallback to first description in rows
  const firstValidRow = rows.find(row => row.Description && row.Description.includes('158-102'));
  if (firstValidRow) {
    return {
      description: firstValidRow.Description,
      acres: calculateAcresFromDescription(firstValidRow.Description),
      legalDescription: firstValidRow.Description
    };
  }
  
  return { description: "Unknown Prospect", acres: 0, legalDescription: "" };
}

function calculateAcresFromDescription(description: string): number {
  // Calculate acres based on legal description
  if (description.includes('E2NE4')) return 80;
  if (description.includes('N2NE4') && description.includes('SE4NE4')) return 120;
  if (description.includes('NE4')) return 160;
  if (description.includes('N2NW4')) return 80;
  if (description.includes('SE4NE4')) return 40;
  return 80; // Default
}

function buildExpertOwnershipChain(rows: RunsheetRow[], targetLegal: string, subdivisions: string[]): MineralOwner[] {
  console.log(`Building expert ownership chain for: ${targetLegal}`);
  console.log(`Total rows to analyze: ${rows.length}`);
  
  const ownershipMap = new Map<string, any>();
  
  // Step 1: Find initial patent/grant (establish chain of title)
  const patents = rows.filter(row => {
    const instrumentType = row['Instrument Type']?.toLowerCase() || '';
    const description = row['Description'] || '';
    const sectionMatch = targetLegal.split('-')[2]?.split(':')[0];
    
    console.log(`Checking row: type=${instrumentType}, desc=${description.substring(0, 30)}...`);
    
    return instrumentType.includes('patent') && 
           description.includes(sectionMatch || '');
  });

  console.log(`Found ${patents.length} patents`);

  if (patents.length > 0) {
    const patent = patents[0];
    const initialOwner = patent['Grantee(s)'] || 'Unknown';
    console.log(`Initial patent owner: ${initialOwner}`);
    
    ownershipMap.set(initialOwner, {
      name: initialOwner,
      interest: '1/1',
      source: 'Patent',
      acquisitionDate: patent['Recorded'] || patent['Dated'],
      active: true
    });
  }

  // Step 2: Process all transfers chronologically to trace ownership
  const transfers = rows.filter(row => {
    const instrumentType = row['Instrument Type']?.toLowerCase() || '';
    const description = row['Description'] || '';
    const sectionMatch = targetLegal.split('-')[2]?.split(':')[0];
    
    const isTransfer = ['wd', 'qcd', 'prd', 'prmd', 'county deed'].includes(instrumentType);
    const matchesSection = description.includes(sectionMatch || '');
    
    if (isTransfer && matchesSection) {
      console.log(`Found transfer: ${instrumentType} - ${row['Grantor(s)']} to ${row['Grantee(s)']}`);
    }
    
    return isTransfer && matchesSection;
  }).sort((a, b) => {
    const dateA = parseDate(a['Recorded'] || a['Dated'] || '0');
    const dateB = parseDate(b['Recorded'] || b['Dated'] || '0');
    return dateA - dateB;
  });

  console.log(`Found ${transfers.length} transfers to process`);

  // Process each transfer to build complete ownership chain
  for (const transfer of transfers) {
    console.log(`Processing transfer: ${transfer['Instrument Type']} from ${transfer['Grantor(s)']} to ${transfer['Grantee(s)']}`);
    processExpertOwnershipTransfer(transfer, ownershipMap, targetLegal);
  }

  console.log(`Active owners in map: ${Array.from(ownershipMap.keys()).filter(key => ownershipMap.get(key).active !== false).length}`);

  // Step 3: Determine current lease status using expert methodology
  const currentOwners: MineralOwner[] = [];
  
  for (const [ownerName, ownerData] of ownershipMap) {
    if (ownerData.active !== false) {
      console.log(`Analyzing lease status for owner: ${ownerName}`);
      const leaseAnalysis = determineExpertLeaseStatus(ownerName, rows, targetLegal);
      const lastLease = findMostRecentValidLease(ownerName, rows, targetLegal);
      
      // Apply expert rules: assume mineral ownership when lease is present unless contradicted
      const hasLease = lastLease !== null;
      const hasDeedOnly = ownerData.source === 'Deed' && !hasLease;
      
      currentOwners.push({
        name: ownerName,
        interests: convertToPercentage(ownerData.interest || '1/1'),
        netAcres: calculateNetAcresFromInterest(ownerData.interest || '1/1', 80),
        leaseholdStatus: hasDeedOnly ? 'Appears Open (Deed-only interest)' : leaseAnalysis.status,
        lastLeaseOfRecord: lastLease,
        landsConveredOnLease: lastLease?.landsConvered,
        listedAcreage: ownerData.listedAcreage || calculateListedAcreage(ownerData.interest, 80)
      });
    }
  }

  console.log(`Final owners count: ${currentOwners.length}`);
  return currentOwners.length > 0 ? currentOwners : generateDefaultOwner(targetLegal);
}

function parseOwnershipFromPRD(prdRow: RunsheetRow, rows: RunsheetRow[], targetLegal: string): MineralOwner[] {
  const owners: MineralOwner[] = [];
  const granteeText = prdRow['Grantee(s)'];
  
  // Parse each grantee line that contains fractional interest
  const granteeLines = granteeText.split('\n').filter(line => line.trim());
  
  for (const granteeLine of granteeLines) {
    if (granteeLine.includes('(') && granteeLine.includes(')')) {
      const name = granteeLine.substring(0, granteeLine.indexOf('(')).trim();
      const interestMatch = granteeLine.match(/\(([^)]+)\)/);
      const rawInterest = interestMatch ? interestMatch[1] : '';
      
      if (name && rawInterest) {
        const interest = convertToPercentage(rawInterest);
        const netAcres = calculateNetAcres(rawInterest, 80);
        const leaseStatus = findCurrentLeaseStatus(name, rows, targetLegal);
        
        owners.push({
          name: name,
          interests: interest,
          netAcres: netAcres,
          leaseholdStatus: leaseStatus.status,
          lastLeaseOfRecord: leaseStatus.lease,
          landsConveredOnLease: leaseStatus.lands,
          listedAcreage: leaseStatus.acreage
        });
      }
    }
  }
  
  return owners;
}

function parseGrantees(granteeText: string): Array<{name: string, interest?: string}> {
  const grantees: Array<{name: string, interest?: string}> = [];
  const lines = granteeText.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    if (line.includes('(') && line.includes(')')) {
      const name = line.substring(0, line.indexOf('(')).trim();
      const interestMatch = line.match(/\(([^)]+)\)/);
      const interest = interestMatch ? interestMatch[1] : undefined;
      
      if (name) {
        grantees.push({ name, interest });
      }
    } else if (line.trim()) {
      grantees.push({ name: line.trim() });
    }
  }
  
  return grantees;
}

function convertToPercentage(interest: string): string {
  if (interest === '1/24') return '4.16666667%';
  if (interest === '1/4') return '25.00000000%';
  if (interest === '1/2') return '50.00000000%';
  if (interest === '100%') return '100.00000000%';
  if (interest.includes('/')) {
    const [num, denom] = interest.split('/').map(n => parseFloat(n.trim()));
    const percentage = (num / denom) * 100;
    return percentage.toFixed(8) + '%';
  }
  return interest;
}

function calculateNetAcres(interest: string, totalAcres: number): number {
  if (interest.includes('/')) {
    const [numerator, denominator] = interest.split('/').map(n => parseFloat(n.trim()));
    return Number(((numerator / denominator) * totalAcres).toFixed(7));
  }
  if (interest.includes('%')) {
    const percentage = parseFloat(interest.replace('%', ''));
    return Number(((percentage / 100) * totalAcres).toFixed(7));
  }
  return totalAcres;
}

function determineExpertLeaseStatus(ownerName: string, rows: RunsheetRow[], targetLegal: string): { status: string, details?: string } {
  console.log(`Expert lease analysis for: ${ownerName}`);
  
  const ownerVariations = generateNameVariations(ownerName);
  
  // Find all OGL leases involving this owner or predecessors
  const ownersLeases = rows.filter(row => 
    row['Instrument Type'] === 'OGL' &&
    ownerVariations.some(variation => 
      row['Grantor(s)']?.toLowerCase().includes(variation.toLowerCase())
    ) &&
    row['Description']?.toLowerCase().includes(targetLegal.toLowerCase())
  ).sort((a, b) => {
    const dateA = parseDate(a['Recorded'] || a['Dated'] || '0');
    const dateB = parseDate(b['Recorded'] || b['Dated'] || '0');
    return dateB - dateA; // Most recent first
  });

  if (ownersLeases.length === 0) {
    return { 
      status: 'Appears Open', 
      details: 'No lease records found for this owner' 
    };
  }

  const mostRecentLease = ownersLeases[0];
  
  // Check for releases
  const releases = rows.filter(row =>
    row['Instrument Type']?.includes('Release') &&
    row['Description']?.toLowerCase().includes(targetLegal.toLowerCase()) &&
    (row['Grantor(s)']?.toLowerCase().includes(mostRecentLease['Grantee(s)']?.toLowerCase() || '') ||
     row['Comments']?.toLowerCase().includes(mostRecentLease['Grantee(s)']?.toLowerCase() || ''))
  );

  if (releases.length > 0) {
    const releaseDate = parseDate(releases[releases.length - 1]['Recorded'] || '0');
    const leaseDate = parseDate(mostRecentLease['Recorded'] || '0');
    
    if (releaseDate > leaseDate) {
      return { 
        status: 'Appears Open', 
        details: 'Most recent lease has been released' 
      };
    }
  }

  // Calculate lease expiration with expert methodology
  const leaseExpiration = calculateExpertLeaseExpiration(mostRecentLease);
  if (leaseExpiration.date) {
    const now = new Date();
    const expDate = new Date(leaseExpiration.date);
    
    if (expDate < now) {
      // Check for potential HBP
      const hbpAnalysis = analyzeHBPPotential(ownerName, rows, targetLegal, expDate);
      
      return { 
        status: hbpAnalysis.isLikely ? 'Expired (Potential HBP)' : 'Appears Open', 
        details: `Primary term expired ${leaseExpiration.formatted}. ${hbpAnalysis.reasoning}` 
      };
    } else {
      return { 
        status: 'Last Lease of Record', 
        details: `Active lease until ${leaseExpiration.formatted}` 
      };
    }
  }

  // If expiration cannot be determined, require production information
  return { 
    status: 'Last Lease of Record', 
    details: 'Active lease - expiration requires production verification' 
  };
}

function generateNameVariations(name: string): string[] {
  const variations = [name];
  
  // Add variations without middle initials, different formats, etc.
  const parts = name.split(' ').filter(part => part.length > 0);
  if (parts.length > 2) {
    variations.push(`${parts[0]} ${parts[parts.length - 1]}`); // First and last only
  }
  
  // Add estate variations
  variations.push(`Estate of ${name}`);
  variations.push(`${name} Estate`);
  
  return variations;
}

function extractTermFromComments(comments: string): string {
  if (comments.includes('10 year term')) return 'Ten (10) Years';
  if (comments.includes('3 year term')) return 'Three (3) Years';
  if (comments.includes('5 year term')) return 'Five (5) Years';
  return 'Three (3) Years'; // Default
}

function calculateExpiration(dated: string, comments: string): string {
  if (!dated) return 'Unknown';
  
  try {
    const year = parseInt(dated);
    let termYears = 3; // Default
    
    if (comments.includes('10 year term')) termYears = 10;
    else if (comments.includes('5 year term')) termYears = 5;
    
    return `10/26/${year + termYears}`;
  } catch (e) {
    return 'Unknown';
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  
  // If it's just a year, format as 10/26/YEAR
  if (dateStr.match(/^\d{4}$/)) {
    return `10/26/${dateStr}`;
  }
  
  return dateStr;
}

function formatLegalDescription(description: string): string {
  if (!description) return '';
  
  // Convert from format like "158-102 18: E2NE4" to "Township 158 North, Range 102 West, Section 18: E2NE"
  const match = description.match(/(\d+)-(\d+)\s*(\d+):\s*(.+)/);
  if (match) {
    const [, township, range, section, portion] = match;
    return `Township ${township} North, Range ${range} West, Section ${section}: ${portion}`;
  }
  
  return description;
}

function extractWellInformation(rows: RunsheetRow[]): string[] {
  const wellInfo: string[] = [];
  
  for (const row of rows) {
    const comments = row['Comments'] || '';
    if (comments.toLowerCase().includes('well') || 
        comments.toLowerCase().includes('production') ||
        comments.toLowerCase().includes('drilling')) {
      wellInfo.push(comments);
    }
  }
  
  if (wellInfo.length === 0) {
    wellInfo.push('No well information found in record');
  }
  
  return wellInfo;
}

// Helper functions for expert mineral rights analysis
function parseSubdivisions(legalDescription: string): string[] {
  const subdivisionPattern = /([NESW]+\d*[NESW]*\d*)/g;
  const matches = legalDescription.match(subdivisionPattern) || [];
  return matches.map(match => match.trim());
}

function processExpertOwnershipTransfer(transfer: RunsheetRow, ownershipMap: Map<string, any>, targetLegal: string): void {
  const grantor = transfer['Grantor(s)'] || '';
  const grantee = transfer['Grantee(s)'] || '';
  const instrumentType = transfer['Instrument Type'];
  
  if (instrumentType === 'PRD' || instrumentType === 'PRMD') {
    // Process probate distribution with expert fractional analysis
    const grantees = parseGranteesWithFractions(grantee);
    
    grantees.forEach(granteeData => {
      if (granteeData.name) {
        ownershipMap.set(granteeData.name, {
          name: granteeData.name,
          interest: granteeData.interest || '1/1',
          source: 'Probate',
          acquisitionDate: transfer['Recorded'] || transfer['Dated'],
          active: true,
          address: extractMostRecentAddress(granteeData.name, ownershipMap)
        });
      }
    });
    
    // Mark grantor as inactive
    if (ownershipMap.has(grantor)) {
      ownershipMap.get(grantor).active = false;
    }
  } else {
    // Regular deed transfer
    if (ownershipMap.has(grantor)) {
      ownershipMap.get(grantor).active = false;
    }
    
    ownershipMap.set(grantee, {
      name: grantee,
      interest: '1/1',
      source: 'Deed',
      acquisitionDate: transfer['Recorded'] || transfer['Dated'],
      active: true,
      address: extractAddressFromRecord(transfer)
    });
  }
}

function parseGranteesWithFractions(granteeText: string): Array<{name: string, interest?: string}> {
  const grantees: Array<{name: string, interest?: string}> = [];
  const lines = granteeText.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    if (line.includes('(') && line.includes(')')) {
      const name = line.substring(0, line.indexOf('(')).trim();
      const interestMatch = line.match(/\(([^)]+)\)/);
      const interest = interestMatch ? interestMatch[1] : undefined;
      
      if (name) {
        grantees.push({ name, interest });
      }
    } else if (line.trim() && !line.includes('*TIC') && !line.includes('Remainderman')) {
      // Handle life estates and remaindermen
      if (line.includes('Life estate')) {
        const name = line.substring(0, line.indexOf('Life estate')).trim();
        grantees.push({ name, interest: 'Life Estate' });
      } else {
        grantees.push({ name: line.trim() });
      }
    }
  }
  
  return grantees;
}

function analyzeHBPPotential(ownerName: string, rows: RunsheetRow[], targetLegal: string, expirationDate: Date): { isLikely: boolean, reasoning: string } {
  const wells = extractWellInformation(rows);
  
  if (wells.length > 0 && wells[0] !== 'No well information found in record') {
    return {
      isLikely: true,
      reasoning: `${wells.length} well(s) noted in record. Production data required to determine HBP status.`
    };
  }
  
  // Check for production-related documents
  const productionDocs = rows.filter(row => 
    (row['Comments'] || '').toLowerCase().includes('production') ||
    (row['Comments'] || '').toLowerCase().includes('royalty') ||
    (row['Instrument Type'] || '').toLowerCase().includes('division order')
  );
  
  if (productionDocs.length > 0) {
    return {
      isLikely: true,
      reasoning: 'Production-related documents found. HBP status requires verification.'
    };
  }
  
  return {
    isLikely: false,
    reasoning: 'No wells or production documents noted. Lease likely expired and acreage returned to open status.'
  };
}

function calculateExpertLeaseExpiration(lease: RunsheetRow): { date: string | null, formatted: string } {
  const comments = lease['Comments'] || '';
  const termMatch = comments.match(/(\d+)\s*year/i);
  const dated = lease['Dated'];
  
  if (termMatch && dated) {
    const years = parseInt(termMatch[1]);
    const leaseYear = parseInt(dated);
    
    if (!isNaN(leaseYear) && !isNaN(years)) {
      const expirationYear = leaseYear + years;
      // Use October 26 as default expiration date (common in ND)
      return {
        date: `${expirationYear}-10-26`,
        formatted: `10/26/${expirationYear}`
      };
    }
  }
  
  return { date: null, formatted: 'Requires production verification' };
}

function findMostRecentValidLease(ownerName: string, rows: RunsheetRow[], targetLegal: string): any {
  const ownerVariations = generateNameVariations(ownerName);
  
  const leases = rows.filter(row => 
    row['Instrument Type'] === 'OGL' &&
    ownerVariations.some(variation => 
      row['Grantor(s)']?.toLowerCase().includes(variation.toLowerCase())
    ) &&
    row['Description']?.toLowerCase().includes(targetLegal.toLowerCase())
  ).sort((a, b) => {
    const dateA = parseDate(a['Recorded'] || a['Dated'] || '0');
    const dateB = parseDate(b['Recorded'] || b['Dated'] || '0');
    return dateB - dateA;
  });

  if (leases.length === 0) return null;

  const lease = leases[0];
  const comments = lease['Comments'] || '';
  const expiration = calculateExpertLeaseExpiration(lease);
  
  return {
    lessor: lease['Grantor(s)'] || '',
    lessee: lease['Grantee(s)'] || '',
    dated: formatDate(lease['Dated']),
    term: extractTermFromComments(comments),
    expiration: expiration.formatted,
    recorded: formatDate(lease['Recorded']),
    documentNumber: lease['Instrument Number'] || lease['Book and Page'] || '',
    landsConvered: [formatLegalDescription(lease['Description'] || '')]
  };
}

function extractMostRecentAddress(ownerName: string, ownershipMap: Map<string, any>): string {
  // In a real implementation, this would extract addresses from the most recent records
  return ''; // Placeholder - addresses would need to be parsed from document details
}

function extractAddressFromRecord(transfer: RunsheetRow): string {
  // In a real implementation, this would extract addresses from transfer documents
  return ''; // Placeholder - addresses would need to be parsed from document details
}

function calculateListedAcreage(interest: string, totalAcres: number): string {
  const netAcres = calculateNetAcresFromInterest(interest, totalAcres);
  return `${netAcres.toFixed(7)} mi`;
}

function calculateNetAcresFromInterest(interest: string, totalAcres: number): number {
  try {
    if (interest.includes('/')) {
      const [num, den] = interest.split('/').map(n => parseFloat(n.trim()));
      return (num / den) * totalAcres;
    }
    if (interest.includes('%')) {
      const percentage = parseFloat(interest.replace('%', ''));
      return (percentage / 100) * totalAcres;
    }
    return totalAcres;
  } catch {
    return totalAcres;
  }
}

function generateDefaultOwner(targetLegal: string): MineralOwner[] {
  return [{
    name: 'Unknown Owner - Requires Additional Research',
    interests: '100.00000000%',
    netAcres: 80,
    leaseholdStatus: 'Unknown - Manual Review Required',
    lastLeaseOfRecord: undefined,
    listedAcreage: '80.0000000 mi'
  }];
}

function parseDate(dateStr: string): number {
  if (!dateStr) return 0;
  
  const num = parseInt(dateStr);
  if (!isNaN(num)) {
    if (num < 10000 && num > 1800) return new Date(num, 0, 1).getTime();
  }
  
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function generateExpertLimitationsAndExceptions(rows: RunsheetRow[]): string {
  const limitations: string[] = [];
  
  // Tax deed analysis
  const taxDeeds = rows.filter(row => row['Instrument Type'] === 'Tax Deed');
  if (taxDeeds.length > 0) {
    limitations.push('Subject to potential tax deed limitations and statutory redemption periods under North Dakota law');
  }
  
  // Foreclosure analysis
  const foreclosures = rows.filter(row => 
    (row['Comments'] || '').toLowerCase().includes('foreclosure') ||
    row['Instrument Type']?.toLowerCase().includes('foreclosure')
  );
  if (foreclosures.length > 0) {
    limitations.push('Subject to foreclosure proceedings and potential redemption rights');
  }
  
  // Mineral reservation analysis
  const reservations = rows.filter(row => 
    (row['Comments'] || '').toLowerCase().includes('reservation') ||
    (row['Comments'] || '').toLowerCase().includes('reserved') ||
    (row['Comments'] || '').toLowerCase().includes('except')
  );
  if (reservations.length > 0) {
    limitations.push('Subject to mineral reservations and exceptions as noted in conveyances');
  }
  
  // Correction documents
  const corrections = rows.filter(row => 
    row['Instrument Type']?.toLowerCase().includes('correction') ||
    (row['Comments'] || '').toLowerCase().includes('correction')
  );
  if (corrections.length > 0) {
    limitations.push('Subject to title corrections and clarifications noted in record');
  }
  
  // Standard limitations
  limitations.push('Title subject to all easements, restrictions, reservations, and covenants of record');
  limitations.push('Subject to all valid liens, encumbrances, and claims not specifically released');
  limitations.push('Mineral ownership subject to all valid outstanding oil and gas leases');
  
  return limitations.join('. ');
}

async function analyzeWithAI(documentText: string): Promise<any> {
  console.log('Starting AI analysis of runsheet document...');
  
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.error('OpenAI API key not configured');
    return generateFallbackAnalysis(documentText);
  }

  try {
    // Professional landman-style runsheet analysis prompt
    const enhancedPrompt = `You are an expert North Dakota oil and gas landman performing a detailed runsheet analysis. Analyze this runsheet row by row, tracing ownership chains and extracting detailed lease information exactly as a professional landman would.

ANALYSIS METHODOLOGY:
1. **Parse each row** of the runsheet systematically
2. **Trace ownership chains** from patents through all conveyances to current owners
3. **Calculate precise ownership percentages** based on actual conveyances and mineral reservations shown
4. **Extract detailed lease information** from all OGL (Oil and Gas Lease) entries
5. **Determine current lease status** based on lease terms and expiration dates
6. **Track vesting documents** for each owner's mineral rights

REQUIRED OUTPUT FORMAT:
{
  "prospect": "Overall legal description (e.g., Section 18, Township 158N, Range 102W)",
  "totalAcres": 320,
  "reportFormat": "ai_analyzed_interactive", 
  "owners": [
    {
      "name": "Full owner name with address if available",
      "address": "Full address if shown in documents", 
      "acquisitionYear": "Year of acquisition (YYYY)",
      "specificLands": "NW 1/4 (or specific legal description this owner holds)",
      "landAcres": 160,
      "vestingDocuments": [
        {
          "type": "Document type (e.g., Sheriff's Deed, Warranty Deed, Mineral Deed)",
          "reference": "Book/Page or Document Number",
          "date": "Document date if available"
        }
      ],
      "interests": "XX.XXXXXXXX%",
      "netAcres": calculated_net_acres,
      "leaseholdStatus": "Appears Leased|Appears Open|Current Lessee",
      "leaseDetails": {
        "currentLease": {
          "lessor": "Lessor name",
          "lessee": "Lessee name (include percentages if multiple lessees)",
          "dated": "MM/DD/YYYY", 
          "term": "Lease term description",
          "expiration": "MM/DD/YYYY",
          "recorded": "MM/DD/YYYY",
          "documentNumber": "Document number",
          "royalty": "XX%",
          "specialClauses": ["Pugh Clause", "Other clauses"],
          "landsCovered": "Legal description of leased lands",
          "listedAcreage": "XXX.XX"
        },
        "lastLeaseOfRecord": {
          // Same structure for expired leases
        }
      }
    }
  ],
  "wells": ["Production information if any"],
  "limitationsAndExceptions": "Standard limitations"
}

**CRITICAL TRACT SEPARATION RULE**: 
- Each owner entry MUST include "specificLands" field showing exactly which quarter/half they own
- If patents show NW 1/4 and NE 1/4 separately, create SEPARATE owner entries for each
- DO NOT combine different legal descriptions under one owner entry
- Track chain of title separately for each quarter/half section

DETAILED INSTRUCTIONS:

1. **LEGAL DESCRIPTION PARSING & TRACT SEPARATION**: 
   - **CRITICAL**: Treat each distinct legal description as a SEPARATE TRACT
   - NW 1/4, NE 1/4, SW 1/4, SE 1/4 are SEPARATE 160-acre tracts
   - N 1/2, S 1/2, E 1/2, W 1/2 are SEPARATE 320-acre tracts
   - Do NOT combine ownership for different quarters/halves
   - Track ownership chains separately for each legal description
   - Example: Patent for "NW 1/4" and separate patent for "NE 1/4" = TWO separate tracts

2. **ROW-BY-ROW ANALYSIS**: Examine each row in the runsheet chronologically. Look for:
   - Patent deeds (original grants from USA)
   - Warranty deeds, quit claim deeds, contracts for deed
   - Sheriff's deeds or other judicial sales
   - Oil and gas leases (OGL)
   - Mineral deeds and mineral reservations
   - Assignments and releases

3. **OWNERSHIP CALCULATIONS**: 
   - Start with 100% ownership from patents FOR EACH DISTINCT LEGAL DESCRIPTION
   - Apply any mineral reservations (e.g., "Excepting 50% of minerals") TO THE SPECIFIC TRACT
   - Track fractional conveyances through each deed FOR EACH TRACT SEPARATELY
   - Calculate final percentages for current owners PER TRACT
   - Use precise decimal places (e.g., 2.80376826%)

3. **CONTRACT FOR DEED vs WARRANTY DEED DISTINCTION**:
   - **Contract for Deed**: Original owner retains legal title until warranty deed is delivered
     - Both the contract vendee (purchaser) AND the original owner may be subject to lease obligations
     - List both parties as potential lessors if no warranty deed has been recorded
     - Note: "Subject to contract for deed - both parties may have leasing rights"
   - **Warranty Deed**: Full ownership transfer is complete upon recording
     - Only the grantee has leasing rights
   - If a contract for deed is followed by a warranty deed, the warranty deed completes the transfer

3. **LEASE EXTRACTION**: For each OGL entry, extract:
   - Exact lessor and lessee names
   - Lease date, term length, and calculated expiration
   - Recording date and document number
   - Royalty percentage
   - Special clauses (Pugh, etc.)
   - Specific legal description covered
   - Listed acreage

4. **CURRENT STATUS DETERMINATION**:
   - "Appears Leased" = Active lease in effect
   - "Appears Open" = No current lease or lease expired
   - "Current Lessee" = Currently holds active lease

5. **ADDRESS EXTRACTION**: Look for addresses in grantor/grantee fields or document descriptions

RUNSHEET DATA TO ANALYZE:
${documentText}

Analyze this data systematically and return the detailed JSON structure with accurate ownership percentages, complete lease details, and proper vesting document references. Pay special attention to document numbers, dates, and mineral reservation language.`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are an expert oil and gas landman. Return only valid JSON responses.' },
          { role: 'user', content: enhancedPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000
      }),
    });

    const data = await response.json();
    console.log('OpenAI response received');

    if (!response.ok) {
      console.error('OpenAI API error:', data);
      return generateFallbackAnalysis(documentText);
    }

    let aiResult;
    try {
      // Clean the response to ensure it's valid JSON
      let content = data.choices[0].message.content.trim();
      
      // Remove any markdown formatting
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Parse the JSON
      aiResult = JSON.parse(content);
      console.log('AI analysis completed successfully');
      
      // Handle different response structures - check for both owners and currentHolders
      let owners = aiResult.owners;
      if (!owners && aiResult.tracts && aiResult.tracts.length > 0 && aiResult.tracts[0].currentHolders) {
        console.log('Converting currentHolders to owners format');
        owners = aiResult.tracts[0].currentHolders.map(holder => ({
          name: holder.name,
          interests: holder.acreageNote || "Interest details from analysis",
          netAcres: aiResult.tracts[0].totalAcres || 0,
          leaseholdStatus: holder.status || "See analysis",
          listedAcreage: holder.acreageNote || "From document analysis"
        }));
        
        // Update the response structure
        aiResult.owners = owners;
        aiResult.reportFormat = "ai_analyzed_interactive";
        aiResult.prospect = aiResult.prospect || "From analysis";
        aiResult.totalAcres = aiResult.tracts[0].totalAcres || 0;
        aiResult.wells = aiResult.tracts[0].wells || [];
        aiResult.limitationsAndExceptions = aiResult.tracts[0].limitationsAndExceptions || aiResult.overallLimitationsAndExceptions || "";
      }

      // Validate we have owners data
      if (!aiResult.owners || !Array.isArray(aiResult.owners) || aiResult.owners.length === 0) {
        console.error('AI response missing owners data, available keys:', Object.keys(aiResult));
        throw new Error('AI response missing owners data');
      }
      
      return aiResult;
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw response:', data.choices[0].message.content);
      return generateFallbackAnalysis(documentText);
    }

  } catch (error) {
    console.error('AI analysis failed:', error);
    return generateFallbackAnalysis(documentText);
  }
}

function generateFallbackAnalysis(documentText: string): any {
  // Try basic parsing if it looks like structured data
  if (documentText.includes('|') || documentText.includes('\t')) {
    console.log('Attempting basic structured parsing as fallback...');
    
    try {
      const rows = parseRunsheetRows(documentText);
      if (rows.length > 0) {
        console.log('Fallback parsing succeeded, processing as structured data');
        return analyzeStructuredRunsheet(documentText);
      }
    } catch (error) {
      console.error('Fallback parsing failed:', error);
    }
  }
  
  // Return helpful error response
  return {
    prospect: "Analysis Error - Document Format Issue",
    totalAcres: 0,
    reportFormat: "error",
    owners: [{
      name: "Document Parsing Failed",
      interests: "100.00000000%",
      netAcres: 0,
      leaseholdStatus: "Manual Review Required - Upload Issue",
      lastLeaseOfRecord: undefined,
      listedAcreage: "0.0000000 mi"
    }],
    wells: ["Document format could not be processed. Please check the upload format."],
    limitationsAndExceptions: "Unable to analyze document. Please ensure your Excel file has proper column headers (Book and Page, Instrument Type, Grantor(s), Grantee(s), Description, Comments) or try pasting the text directly."
  };
}