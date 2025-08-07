import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rowContent, rowNumber, prospect, totalAcres, currentOwnership } = await req.json();
    
    console.log(`Analyzing row ${rowNumber}: ${rowContent}`);

    const analysisPrompt = `
You are a professional oil and gas landman analyzing a single row from a runsheet document. Your task is to determine what this specific row tells us about ownership or leasing changes.

CONTEXT:
- Prospect: ${prospect}
- Total Acres: ${totalAcres}
- Current Ownership State: ${JSON.stringify(currentOwnership)}

ROW TO ANALYZE:
Row ${rowNumber}: ${rowContent}

ANALYSIS INSTRUCTIONS:
1. Determine the document type (WD, QCD, MD, PRMD, OGL, etc.)
2. Extract document number/reference if present
3. Identify grantors (sellers/lessors) and grantees (buyers/lessees)
4. Determine if this represents an ownership change
5. Estimate percentage of ownership involved (if determinable)
6. Determine lease status if this is a lease document
7. Extract effective dates, acreage, and other key details
8. Provide a clear description of what this row represents

IMPORTANT ANALYSIS RULES:
- WD = Warranty Deed (ownership transfer)
- QCD = Quit Claim Deed (ownership transfer)
- MD = Mineral Deed (mineral rights transfer)
- PRMD = Partial Release Mineral Deed (partial mineral release)
- OGL = Oil and Gas Lease (leasing document)
- Patent = Original government grant
- Be careful with percentages - look for fractions, percentages, or words like "undivided"
- Note if this affects surface vs mineral rights
- Identify if this is a current lease or expired lease

Return your analysis as JSON with this exact structure:
{
  "documentType": "string (WD, QCD, MD, OGL, etc.)",
  "documentNumber": "string or null",
  "recordingReference": "string or null (Book/Page or Document Number)",
  "grantors": ["array of grantor names"],
  "grantees": ["array of grantee names"],
  "ownershipChange": boolean,
  "leaseStatus": "active" | "expired" | "none",
  "percentageChange": number or null,
  "effectiveDate": "string or null",
  "acreage": number or null,
  "description": "Brief description of what this row represents",
  "leaseDetails": {
    "lessor": "string or null",
    "lessee": "string or null",
    "term": "string or null",
    "expiration": "string or null",
    "royalty": "string or null",
    "clauses": ["array of special clauses like Pugh"]
  },
  "confidence": "high" | "medium" | "low",
  "notes": "Any additional observations or uncertainties"
}

EXAMPLE RESPONSES:

For "Bk. 131, Pg. 489 | WD | 6/15/1978 | John Smith | Mary Johnson":
{
  "documentType": "WD",
  "documentNumber": null,
  "recordingReference": "Bk. 131, Pg. 489",
  "grantors": ["John Smith"],
  "grantees": ["Mary Johnson"],
  "ownershipChange": true,
  "leaseStatus": "none",
  "percentageChange": null,
  "effectiveDate": "6/15/1978",
  "acreage": null,
  "description": "Warranty deed transferring ownership from John Smith to Mary Johnson",
  "leaseDetails": {},
  "confidence": "high",
  "notes": "Standard warranty deed transfer"
}

For "#756234 | OGL | 5/15/2020 | Smith Trust | XYZ Energy | 5 years | 20% royalty":
{
  "documentType": "OGL",
  "documentNumber": "756234",
  "recordingReference": "#756234",
  "grantors": ["Smith Trust"],
  "grantees": ["XYZ Energy"],
  "ownershipChange": false,
  "leaseStatus": "active",
  "percentageChange": null,
  "effectiveDate": "5/15/2020",
  "acreage": null,
  "description": "Oil and gas lease from Smith Trust to XYZ Energy with 5-year term and 20% royalty",
  "leaseDetails": {
    "lessor": "Smith Trust",
    "lessee": "XYZ Energy",
    "term": "5 years",
    "expiration": "5/15/2025",
    "royalty": "20%",
    "clauses": []
  },
  "confidence": "high",
  "notes": "Active lease with standard terms"
}

Analyze the provided row now:
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert oil and gas landman with deep knowledge of property records, mineral rights, and lease analysis. You excel at parsing runsheet data and determining ownership and leasehold changes.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;
    
    console.log('Raw AI analysis:', analysisText);

    // Parse the JSON response
    let analysis;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      // Fallback analysis
      analysis = {
        documentType: "Unknown",
        documentNumber: null,
        recordingReference: null,
        grantors: [],
        grantees: [],
        ownershipChange: false,
        leaseStatus: "none",
        percentageChange: null,
        effectiveDate: null,
        acreage: null,
        description: "Could not parse row content",
        leaseDetails: {},
        confidence: "low",
        notes: "AI analysis failed, manual review required"
      };
    }

    console.log('Parsed analysis:', analysis);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-row-ownership function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      documentType: "Error",
      documentNumber: null,
      recordingReference: null,
      grantors: [],
      grantees: [],
      ownershipChange: false,
      leaseStatus: "none",
      percentageChange: null,
      effectiveDate: null,
      acreage: null,
      description: "Analysis failed due to error",
      leaseDetails: {},
      confidence: "low",
      notes: `Error: ${error.message}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});