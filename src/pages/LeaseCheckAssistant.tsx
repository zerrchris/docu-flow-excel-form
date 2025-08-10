import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import * as XLSX from 'xlsx';

const todayStr = () => new Date().toISOString().slice(0,10);

interface OwnerRow {
  owner: string;
  percent: number; // 0..100
  net_acres: number;
  status: string;
}

interface FlagRow {
  doc?: string;
  note: string;
}

// Normalize date-like fields in a runsheet row to ISO YYYY-MM-DD so the extractor can read them reliably
function normalizeRowDates(row: any) {
  const dateKeys = [
    'Dated','Date','Recorded','Record Date','Filing Date','Execution Date','Rec Date','Recording Date'
  ];
  const out: any = { ...row };
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)).getTime(); // Excel epoch (handles 1900 leap bug)
  const toISO = (d: Date) => (isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10));
  const serialToDate = (n: number) => new Date(excelEpoch + Math.round(n) * 86400000);
  const parseMaybe = (v: any): string => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return toISO(serialToDate(v));
    const s = String(v).trim();
    // Numeric string that looks like Excel serial
    if (/^\d{1,6}$/.test(s)) return toISO(serialToDate(Number(s)));
    // Try native parse for common formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
    const d = new Date(s);
    return toISO(d);
  };
  for (const k of dateKeys) {
    if (k in out) {
      const normalized = parseMaybe(out[k]);
      if (normalized) out[k] = normalized;
    }
  }
  return out;
}

const LeaseCheckAssistant: React.FC = () => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [tractKey, setTractKey] = useState('');
  const [asOf, setAsOf] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [progress, setProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 });
  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);
  const [extractedEvents, setExtractedEvents] = useState<any[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [leaseOverrides, setLeaseOverrides] = useState<Record<string, { production_present: boolean; top_lease: boolean; boundary_pugh: boolean; depth_pugh: boolean }>>({});
  useEffect(() => {
    document.title = 'Lease Check Assistant | RunsheetPro';
    const desc = 'Upload runsheet Excel/CSV, set tract and date, and compute assumed mineral ownership.';
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = desc;

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = window.location.origin + '/lease-check-assistant';
  }, []);

  const parsedCount = rows.length;

  const handleFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      setRows(data as any[]);
      toast({ title: 'File parsed', description: `${(data as any[]).length} rows detected.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Parse failed', description: e?.message || 'Could not parse file', variant: 'destructive' });
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      handleFile(f);
    }
  };

  const run = async () => {
    if (!rows.length || !tractKey) {
      toast({ title: 'Missing data', description: 'Please upload a file and enter a Tract Key.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setCancelled(false);
    cancelledRef.current = false;
    setOwners([]);
    setFlags([]);
    const total = rows.length;
    setProgress({ total, done: 0 });
    try {
      const chunkSize = 8;
      const events: any[] = [];

      for (let i = 0; i < rows.length; i += chunkSize) {
        if (cancelledRef.current) {
          toast({ title: 'Cancelled', description: 'Lease check cancelled.' });
          setLoading(false);
          return;
        }
        const batch = rows.slice(i, i + chunkSize);
        let extractData: any | null = null;
        let lastError: any = null;
        const processedBatch = batch.map(normalizeRowDates);
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res: any = await supabase.functions.invoke('lease-check-extract', {
            body: { rows: processedBatch, concurrency: 6 },
          });
          if (!res.error) { extractData = res.data; break; }
          lastError = res.error;
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
        if (!extractData) throw lastError || new Error('Failed to extract events');
        if ((extractData?.events || []).length) events.push(...extractData.events);
        setProgress((p) => ({ total: p.total, done: Math.min(total, p.done + batch.length) }));
      }

      if (cancelledRef.current) {
        toast({ title: 'Cancelled', description: 'Lease check cancelled.' });
        return;
      }

      // After extraction, enter review step instead of running immediately
      const leaseEvents = events.filter((e: any) => {
        const it = String(e?.instrument_type || '').toLowerCase();
        return it.includes('lease') || it.includes('ogl') || it.includes('oil and gas lease');
      });
      const initialOverrides: Record<string, { production_present: boolean; top_lease: boolean; boundary_pugh: boolean; depth_pugh: boolean }> = {};
      for (const e of leaseEvents) {
        const id = e?.doc_id || e?.recording || e?.id || `${e?.dated || ''}-${e?.recorded || ''}`;
        if (id) initialOverrides[id] = { production_present: false, top_lease: false, boundary_pugh: false, depth_pugh: false };
      }
      setLeaseOverrides(initialOverrides);
      setExtractedEvents(events);
      setShowReview(true);
      toast({ title: 'Review leases', description: `${leaseEvents.length} lease(s) detected. Mark production/top-lease/Pugh, then Compute.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Lease check failed', description: e?.message || 'Try again or review your inputs.', variant: 'destructive' });
    } finally {
      setLoading(false);
      setProgress({ total: 0, done: 0 });
    }
  };

  const leases = useMemo(() => extractedEvents.filter((e: any) => {
    const typeCandidate = e?.instrument_type ?? e?.instrument ?? e?.instrumentType ?? e?.doc_type ?? e?.type ?? '';
    const it = String(typeCandidate).toLowerCase();
    const text = `${e?.description || ''} ${e?.comments || ''}`.toLowerCase();
    const hasLeaseWord = it.includes('lease') || it.includes('ogl') || it.includes('oil & gas') || it.includes('oil and gas') || text.includes('lease');
    return hasLeaseWord;
  }).map((e: any, i: number) => ({
    doc: e?.doc_id || e?.recording || e?.id || `${e?.dated || ''}-${e?.recorded || ''}` || `doc-${i}`,
    date: e?.recorded || e?.dated || '',
    grantors: e?.grantors || [],
    grantees: e?.grantees || [],
    description: e?.description || e?.comments || ''
  })), [extractedEvents]);

  const computeOwnership = async () => {
    try {
      setLoading(true);
      const { data: runData, error: runError } = await supabase.functions.invoke('lease-check-run', {
        body: {
          events: extractedEvents,
          tract_key: tractKey,
          as_of: asOf,
          lease_overrides: leaseOverrides,
        },
      });
      if (runError) throw runError;
      setOwners((runData?.owners || []) as OwnerRow[]);
      setFlags((runData?.flags || []) as FlagRow[]);
      toast({ title: 'Lease check complete', description: `${(runData?.owners || []).length} owners computed.` });
      setShowReview(false);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Lease check failed', description: e?.message || 'Try again or review your inputs.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Lease Check Assistant</h1>
          <p className="text-muted-foreground mt-1">Upload a runsheet (Excel/CSV), set a tract and date, and compute assumed mineral ownership. Not a title opinion.</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Upload & Settings</CardTitle>
            <CardDescription>Supports .xlsx, .xls, .csv. Columns like Recording Info, Instrument Type, Dated, Recorded, Grantor, Grantee, Description, Comments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="file">Runsheet File</Label>
                <Input id="file" type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} />
                {file && <p className="text-sm text-muted-foreground">{file.name} • {parsedCount} rows</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tract">Tract Key</Label>
                <Input id="tract" placeholder="e.g., T158N-R102W Sec 12 SE/4" value={tractKey} onChange={(e) => setTractKey(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asof">As of Date</Label>
                <Input id="asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </div>
              <div className="pt-6 text-sm text-muted-foreground">Production is set per-lease in the next step.</div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button onClick={run} disabled={loading || !rows.length || !tractKey}>
                  {loading ? (progress.total ? `Extracting ${progress.done}/${progress.total}…` : 'Running…') : 'Extract & Review Leases'}
                </Button>
                {loading && progress.total > 0 && (
                  <Button variant="outline" onClick={() => { setCancelled(true); cancelledRef.current = true; setLoading(false); toast({ title: 'Cancelled', description: 'Lease check cancelled.' }); }}>
                    Cancel
                  </Button>
                )}
              </div>
              {loading && progress.total > 0 && (
                <div className="space-y-1">
                  <Progress value={(progress.done / progress.total) * 100} />
                  <p className="text-sm text-muted-foreground">Processing {progress.done} of {progress.total} rows…</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {showReview && (
          <Card>
            <CardHeader>
              <CardTitle>Review leases for production and Pugh</CardTitle>
              <CardDescription>Mark production per lease. If a later lease is not a top lease, earlier leases are assumed expired.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doc</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Parties</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Production</TableHead>
                    <TableHead>Top lease</TableHead>
                    <TableHead>Boundary Pugh</TableHead>
                    <TableHead>Depth Pugh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leases.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.doc}</TableCell>
                      <TableCell>{l.date}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{(l.grantors || []).join(', ')}</div>
                          <div className="text-muted-foreground">→ {(l.grantees || []).join(', ')}</div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate" title={l.description || ''}>{l.description}</TableCell>
                      <TableCell>
                        <Switch checked={!!leaseOverrides[l.doc]?.production_present}
                          onCheckedChange={(v) => setLeaseOverrides((s) => ({ ...s, [l.doc]: { production_present: !!v, top_lease: !!s[l.doc]?.top_lease, boundary_pugh: !!s[l.doc]?.boundary_pugh, depth_pugh: !!s[l.doc]?.depth_pugh } }))} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={!!leaseOverrides[l.doc]?.top_lease}
                          onCheckedChange={(v) => setLeaseOverrides((s) => ({ ...s, [l.doc]: { production_present: !!s[l.doc]?.production_present, top_lease: !!v, boundary_pugh: !!s[l.doc]?.boundary_pugh, depth_pugh: !!s[l.doc]?.depth_pugh } }))} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={!!leaseOverrides[l.doc]?.boundary_pugh}
                          onCheckedChange={(v) => setLeaseOverrides((s) => ({ ...s, [l.doc]: { production_present: !!s[l.doc]?.production_present, top_lease: !!s[l.doc]?.top_lease, boundary_pugh: !!v, depth_pugh: !!s[l.doc]?.depth_pugh } }))} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={!!leaseOverrides[l.doc]?.depth_pugh}
                          onCheckedChange={(v) => setLeaseOverrides((s) => ({ ...s, [l.doc]: { production_present: !!s[l.doc]?.production_present, top_lease: !!s[l.doc]?.top_lease, boundary_pugh: !!s[l.doc]?.boundary_pugh, depth_pugh: !!v } }))} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4">
                <Button onClick={computeOwnership} disabled={loading || leases.length === 0}>{loading ? 'Computing…' : 'Compute Ownership'}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {owners.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Owners</CardTitle>
              <CardDescription>Computed per your inputs. Review before relying.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Percent</TableHead>
                    <TableHead className="text-right">Net Acres</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owners.map((o, i) => (
                    <TableRow key={i}>
                      <TableCell>{o.owner}</TableCell>
                      <TableCell className="text-right">{o.percent.toFixed(6)}%</TableCell>
                      <TableCell className="text-right">{o.net_acres.toFixed(6)}</TableCell>
                      <TableCell>{o.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {!loading && owners.length === 0 && !showReview && extractedEvents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No owners found</CardTitle>
              <CardDescription>No computed owners matched this tract. Check your tract key or lease decisions and try again.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {flags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Flags (Needs Review)</CardTitle>
              <CardDescription>Items that may require a landman review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="list-disc pl-6">
                {flags.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    {f.doc ? `Doc ${f.doc}: ` : ''}{f.note}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <section className="prose max-w-none">
          <h2>Notes</h2>
          <p>
            This assistant uses AI to structure rows into events and a deterministic rule engine to compute assumed ownership. Treat results as guidance only.
          </p>
        </section>
      </main>
    </div>
  );
};

export default LeaseCheckAssistant;
