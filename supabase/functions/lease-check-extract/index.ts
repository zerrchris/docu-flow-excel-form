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
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return {};
  }
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
