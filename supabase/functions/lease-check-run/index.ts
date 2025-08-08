import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const m = String(f).trim().match(/^(\d+)/(\d+)$/);
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

    if (["easement", "mortgage", "surfaceonly"].includes(it)) continue;

    if (it.includes('ogl')) continue;

    const le = e?.life_estate || {};
    if (it === 'lifeestate' || le?.present) {
      flags.push({ doc: e?.doc_id, note: 'Life estate detected; confirm termination status' });
      continue;
    }

    const reservation = e?.mineral_reservation || {};
    const reserved = !!reservation?.reserved;
    if (reserved && ["wd", "qcd", "deed", "trustdeed", "person-representative", "prmd"].includes(it)) {
      continue;
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
    const events: any[] = body?.events || [];
    const tract_key: string = body?.tract_key || '';
    const as_of: string = body?.as_of || new Date().toISOString().slice(0, 10);
    const hbp: boolean = !!body?.hbp;
    const total_acres: number = typeof body?.total_acres === 'number' ? body.total_acres : 160;

    if (!events?.length || !tract_key) {
      return new Response(JSON.stringify({ error: 'events[] and tract_key are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('lease-check-run: running leasecheck on', events.length, 'events');

    const result = runLeasecheck(events, tract_key, as_of, hbp, total_acres);

    return new Response(JSON.stringify({ events_count: events.length, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('lease-check-run error:', error);
    return new Response(JSON.stringify({ error: 'Unexpected error', details: String((error as any)?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
