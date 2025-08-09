import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: call OpenAI to extract a normalized event from a single row
async function extractEvent(row: Record<string, unknown>) {
  const system = `You are a careful oil & gas runsheet extractor. Return ONLY a single JSON object with this schema:
{
  "instrument_type": string,          // e.g. "Oil & Gas Lease", "Mineral Deed", "Assignment", "Release"
  "instrument": string,               // same as instrument_type if unknown
  "doc_id": string|null,              // recording reference if present
  "dated": string|null,               // YYYY-MM-DD when possible
  "recorded": string|null,            // YYYY-MM-DD when possible
  "grantors": string[]|null,          // array of names
  "grantees": string[]|null,          // array of names
  "description": string|null,         // body text/remarks
  "comments": string|null,            // extra notes
  "tract": string|null,               // any tract/lands text if present
  "acres": number|null                // if explicitly stated in the row
}
Rules:
- Prefer exact text from the row; do not infer or invent.
- If you see words like "OGL", "Oil & Gas Lease", "OGML", "Memo of Lease", classify instrument_type as a lease.
- If uncertain, leave fields null rather than guessing.`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(row) },
    ],
    temperature: 0.2,
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('OpenAI error:', err);
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(content);
    return normalizeEvent(parsed, row);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try { return normalizeEvent(JSON.parse(match[0]), row); } catch {}
    }
    return normalizeEvent({}, row);
  }
}

// Normalize and enrich the extracted event using original row heuristics
function normalizeEvent(evt: any, row: Record<string, unknown>) {
  const e: any = { ...(evt || {}) };

  const lower = (v: unknown) => typeof v === 'string' ? v.toLowerCase() : '';
  const get = (obj: Record<string, unknown>, keys: string[]): string | null => {
    for (const k of keys) {
      const val = (obj as any)[k] ?? (obj as any)[k.replace(/\s+/g, '_')] ?? (obj as any)[k.replace(/\s+/g, '').toLowerCase()];
      if (val != null && val !== '') return String(val);
    }
    return null;
  };
  const toArray = (v: unknown): string[] | null => {
    if (!v) return null;
    if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
    const s = String(v);
    if (!s.trim()) return null;
    return s.split(/;|,|\n/).map((x) => x.trim()).filter(Boolean);
  };

  // Build a big text corpus from the row for keyword detection
  const rowText = Object.values(row || {}).map((v) => String(v || '')).join(' ').toLowerCase();

  // Instrument type normalization
  const instFromEvt = e.instrument_type || e.instrument || e.instrumentType || e.doc_type || e.type;
  let instrument = String(instFromEvt || '').trim();
  if (!instrument) {
    instrument = get(row as any, ['Instrument Type', 'Instrument', 'Doc Type', 'Type', 'Document Type']) || '';
  }
  if (!instrument) {
    if (/(\bogl\b|oil\s*&?\s*gas\s*lease|ogml|memo of lease)/i.test(rowText)) {
      instrument = 'Oil & Gas Lease';
    }
  }
  e.instrument_type = instrument || null;
  e.instrument = e.instrument || e.instrument_type || null;

  // Parties
  e.grantors = toArray(e.grantors) || toArray(get(row as any, ['Grantor', 'Grantors', 'Lessor', 'Lessors']));
  e.grantees = toArray(e.grantees) || toArray(get(row as any, ['Grantee', 'Grantees', 'Lessee', 'Lessees']));

  // Descriptions / comments
  e.description = e.description || get(row as any, ['Description', 'Desc', 'Remarks', 'Body']) || null;
  e.comments = e.comments || get(row as any, ['Comments', 'Comment', 'Notes']) || null;

  // Dates / IDs
  e.doc_id = e.doc_id || get(row as any, ['Recording Info', 'Recording', 'Doc #', 'Document Number', 'Instrument No', 'Instrument Number']) || null;
  e.dated = e.dated || get(row as any, ['Dated', 'Date']) || null;
  e.recorded = e.recorded || get(row as any, ['Recorded', 'Record Date', 'Filing Date']) || null;

  // Tract / acres
  e.tract = e.tract || get(row as any, ['Tract', 'Lands', 'Legal Description', 'Tract Key']) || null;
  const acresStr: any = e.acres ?? get(row as any, ['Acres', 'Gross Acres', 'Net Acres']);
  e.acres = typeof acresStr === 'number' ? acresStr : (acresStr ? Number(String(acresStr).replace(/[^0-9.]/g, '')) || null : null);

  return e;
}

// Run tasks with limited concurrency
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        console.error('extract failed at', idx, e);
        results[idx] = undefined as unknown as R; // keep slot
      }
    }
  });
  await Promise.all(workers);
  return results.filter((r) => r !== undefined);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const rows: Record<string, unknown>[] = body?.rows || [];
    const concurrency: number = Math.min(8, Math.max(1, Number(body?.concurrency) || 5));

    if (!rows?.length) {
      return new Response(JSON.stringify({ error: 'rows[] is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('lease-check-extract: extracting events for', rows.length, 'rows with concurrency', concurrency);

    const events = await mapWithConcurrency(rows, concurrency, (row) => extractEvent(row));

    return new Response(JSON.stringify({ events_count: events.length, events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('lease-check-extract error:', error);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: String((error as any)?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
