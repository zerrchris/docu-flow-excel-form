import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: call OpenAI to extract a normalized event from a single row
async function extractEvent(row: Record<string, unknown>) {
  const system =
    "You extract oil & gas runsheet rows into strict JSON. Be conservative; never invent fractions. If ambiguous, lower confidence and add a brief rationale in notes. Return only JSON.";

  const payload = {
    model: 'gpt-4.1-2025-04-14',
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
    return JSON.parse(content);
  } catch {
    // Best-effort fallback: attempt to extract JSON block
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return {};
  }
}

// Minimal tract matcher: ensure TRS + section present in tract_key
function tractMatches(evt: any, tract_key: string) {
  const tracts = evt?.tracts || [];
  return tracts.some((t: any) => {
    const trs = (t?.trs || '').toString().toLowerCase();
    const sec = (t?.sec || '').toString();
    return trs && sec && tract_key.toLowerCase().includes(trs) && tract_key.includes(sec);
  });
}

function parseFraction(f: string | null | undefined): number | null {
  if (!f) return null;
  const m = String(f).trim().match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const den = parseFloat(m[2]);
  if (!den) return null;
  return num / den;
}

function runLeasecheck(events: any[], tract_key: string, as_of: string, hbp: boolean, total_acres: number) {
  const owners: Record<string, number> = {};
  const flags: Array<{ doc?: string; note: string }> = [];

  const sorted = [...events].sort((a, b) => {
    const da = a?.recorded || a?.dated || '';
    const db = b?.recorded || b?.dated || '';
    return String(da).localeCompare(String(db));
  });

  for (const e of sorted) {
    if (!tractMatches(e, tract_key)) continue;

    const it = String(e?.instrument_type || '').toLowerCase();
    const grantors: string[] = e?.grantors || [];
    const grantees: string[] = e?.grantees || [];

    if (["easement", "mortgage", "surfaceonly"].includes(it)) continue; // ignore surface-only & non-mineral

    // Leases: for MVP we only set status later via hbp toggle
    if (it.includes('ogl')) continue;

    // Life estate (flag for review in MVP)
    const le = e?.life_estate || {};
    if (it === 'lifeestate' || le?.present) {
      flags.push({ doc: e?.doc_id, note: 'Life estate detected; confirm termination status' });
      continue;
    }

    const reservation = e?.mineral_reservation || {};
    const reserved = !!reservation?.reserved;
    if (reserved && ["wd", "qcd", "deed", "trustdeed", "person-representative", "prmd"].includes(it)) {
      continue; // surface-only
    }

    const conveysAll = !!e?.conveys_all_interest;
    const fracWhole = parseFraction(e?.fraction_whole);

    if (conveysAll) {
      for (const g of grantors) {
        const grantorFrac = owners[g] || 0;
        if (grantorFrac > 0 && grantees?.length) {
          const share = grantorFrac / grantees.length;
          owners[g] = 0;
          for (const r of grantees) owners[r] = (owners[r] || 0) + share;
        } else {
          flags.push({ doc: e?.doc_id, note: `Conveys all interest but unknown grantor share for ${g}` });
        }
      }
    } else if (typeof fracWhole === 'number') {
      const abs = fracWhole;
      if (grantors?.length) {
        const perG = abs / grantors.length;
        for (const g of grantors) owners[g] = (owners[g] || 0) - perG;
      }
      if (grantees?.length) {
        const perR = abs / grantees.length;
        for (const r of grantees) owners[r] = (owners[r] || 0) + perR;
      }
    }
  }

  // Clean tiny negatives
  for (const k of Object.keys(owners)) {
    if (Math.abs(owners[k]) < 1e-9) delete owners[k];
  }

  const rows = Object.entries(owners)
    .map(([name, frac]) => {
      const f = Math.max(0, frac);
      const nma = f * total_acres;
      return {
        owner: name,
        percent: (nma / total_acres) * 100,
        net_acres: nma,
        status: hbp ? 'Appears Leased' : 'Appears Open',
      };
    })
    .sort((a, b) => b.net_acres - a.net_acres);

  return { owners: rows, flags };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rows: Record<string, unknown>[] = body?.rows || [];
    const tract_key: string = body?.tract_key || '';
    const as_of: string = body?.as_of || new Date().toISOString().slice(0, 10);
    const hbp: boolean = !!body?.hbp;
    const total_acres: number = typeof body?.total_acres === 'number' ? body.total_acres : 160;

    if (!openAIApiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!rows?.length || !tract_key) {
      return new Response(JSON.stringify({ error: 'rows[] and tract_key are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('LeaseCheckAssistant: extracting events for', rows.length, 'rows');

    const events: any[] = [];
    for (const row of rows) {
      try {
        const evt = await extractEvent(row);
        if (evt && Object.keys(evt).length) events.push(evt);
      } catch (e) {
        console.error('Row extraction failed:', e);
      }
    }

    console.log('LeaseCheckAssistant: extracted', events.length, 'events');

    const result = runLeasecheck(events, tract_key, as_of, hbp, total_acres);

    return new Response(JSON.stringify({ events_count: events.length, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('LeaseCheckAssistant error:', error);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: String((error as any)?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
