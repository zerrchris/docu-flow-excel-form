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

const LeaseCheckAssistant: React.FC = () => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [tractKey, setTractKey] = useState('');
  const [asOf, setAsOf] = useState(todayStr());
  const [hbp, setHbp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [progress, setProgress] = useState<{ total: number; done: number }>({ total: 0, done: 0 });
  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);
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
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res: any = await supabase.functions.invoke('lease-check-extract', {
            body: { rows: batch, concurrency: 6 },
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

      const { data: runData, error: runError } = await supabase.functions.invoke('lease-check-run', {
        body: {
          events,
          tract_key: tractKey,
          as_of: asOf,
          hbp,
        },
      });
      if (runError) throw runError;
      setOwners((runData?.owners || []) as OwnerRow[]);
      setFlags((runData?.flags || []) as FlagRow[]);
      toast({ title: 'Lease check complete', description: `${(runData?.owners || []).length} owners computed.` });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Lease check failed', description: e?.message || 'Try again or review your inputs.', variant: 'destructive' });
    } finally {
      setLoading(false);
      setProgress({ total: 0, done: 0 });
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
              <div className="flex items-center gap-3 pt-6">
                <Switch id="hbp" checked={hbp} onCheckedChange={setHbp} />
                <Label htmlFor="hbp">Held by Production (HBP)</Label>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button onClick={run} disabled={loading || !rows.length || !tractKey}>
                  {loading ? (progress.total ? `Extracting ${progress.done}/${progress.total}…` : 'Running…') : 'Run Lease Check'}
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
