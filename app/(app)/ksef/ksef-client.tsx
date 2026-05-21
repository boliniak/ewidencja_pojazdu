'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Receipt, Settings, Plus, Fuel, Trash2, CheckCircle, XCircle, Save, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

export function KsefClient() {
  const { data: session } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [tab, setTab] = useState('invoices');
  const [config, setConfig] = useState<any>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [configForm, setConfigForm] = useState({ nip: '', token: '', environment: 'TEST', active: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fetchDialogOpen, setFetchDialogOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchLogs, setFetchLogs] = useState<string[]>([]);
  const [fetchRange, setFetchRange] = useState({ dateFrom: '', dateTo: '' });
  const [form, setForm] = useState({ invoiceNumber: '', ksefNumber: '', issueDate: '', sellerName: '', sellerNip: '', grossAmount: '', netAmount: '', vatAmount: '', isFuel: false, fuelLiters: '', fuelPricePerLiter: '' });

  const fetchConfig = () => { fetch('/api/ksef/config').then(r => r.json()).then(d => { setConfig(d ?? {}); setConfigForm({ nip: d?.nip ?? '', token: '', environment: d?.environment ?? 'TEST', active: d?.active ?? false }); }).catch(() => {}); };
  const fetchInvoices = () => { fetch('/api/ksef/invoices').then(r => r.json()).then(d => setInvoices(d ?? [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { fetchConfig(); fetchInvoices(); }, []);

  const openFetchDialog = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    setFetchRange({
      dateFrom: firstDay.toISOString().split('T')[0],
      dateTo: now.toISOString().split('T')[0],
    });
    setFetchLogs([]);
    setFetchDialogOpen(true);
  };

  const fetchFromKsef = async () => {
    setFetching(true);
    setFetchLogs(['Łączenie z KSeF...']);
    try {
      const res = await fetch('/api/ksef/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchRange),
      });
      const data = await res.json();
      if (data?.logs) setFetchLogs(data.logs);
      if (res.ok && data?.success) {
        toast.success(`Pobrano ${data.imported} faktur z KSeF${data.skipped ? ` (pominięto ${data.skipped} duplikatów)` : ''}`);
        fetchInvoices();
        setFetchDialogOpen(false);
      } else {
        toast.error(data?.error ?? 'Błąd pobierania z KSeF');
        if (data?.hint) setFetchLogs(prev => [...prev, `💡 ${data.hint}`]);
      }
    } catch (e: any) {
      toast.error('Błąd połączenia z KSeF');
      setFetchLogs(prev => [...prev, `Błąd: ${e?.message}`]);
    } finally {
      setFetching(false);
    }
  };

  const saveConfig = async () => {
    const res = await fetch('/api/ksef/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(configForm) });
    if (res.ok) { toast.success('Konfiguracja zapisana'); fetchConfig(); } else { toast.error('Błąd'); }
  };

  const addInvoice = async () => {
    const res = await fetch('/api/ksef/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) { toast.success('Faktura dodana'); setDialogOpen(false); fetchInvoices(); } else { toast.error('Błąd'); }
  };

  const toggleFuel = async (inv: any) => {
    await fetch(`/api/ksef/invoices/${inv?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isFuel: !inv?.isFuel }) });
    fetchInvoices();
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Usunąć?')) return;
    await fetch(`/api/ksef/invoices/${id}`, { method: 'DELETE' });
    fetchInvoices();
  };

  const openNew = () => {
    const today = new Date();
    setForm({ invoiceNumber: '', ksefNumber: '', issueDate: today.toISOString().split('T')[0], sellerName: '', sellerNip: '', grossAmount: '', netAmount: '', vatAmount: '', isFuel: false, fuelLiters: '', fuelPricePerLiter: '' });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold tracking-tight">KSeF – Faktury VAT</h1>
        <p className="text-muted-foreground">Integracja z Krajowym Systemem e-Faktur i zarządzanie fakturami</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="invoices"><Receipt className="w-4 h-4 mr-1" /> Faktury</TabsTrigger>
          <TabsTrigger value="config"><Settings className="w-4 h-4 mr-1" /> Konfiguracja</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">Zarządzaj fakturami i oznaczaj faktury paliwowe</p>
            <div className="flex gap-2">
              {config?.active && config?.hasToken && isAdmin && (
                <Button variant="outline" onClick={openFetchDialog}><Download className="w-4 h-4 mr-1" /> Pobierz z KSeF</Button>
              )}
              <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Dodaj fakturę</Button>
            </div>
          </div>

          {/* Dialog pobierania z KSeF */}
          <Dialog open={fetchDialogOpen} onOpenChange={setFetchDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Pobierz faktury z KSeF</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  System połączy się z Krajowym Systemem e-Faktur i pobierze faktury kosztowe (zakupowe) z podanego zakresu dat.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data od</Label>
                    <Input type="date" value={fetchRange.dateFrom} onChange={(e: any) => setFetchRange(p => ({...p, dateFrom: e?.target?.value ?? ''}))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data do</Label>
                    <Input type="date" value={fetchRange.dateTo} onChange={(e: any) => setFetchRange(p => ({...p, dateTo: e?.target?.value ?? ''}))} />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{config?.environment === 'PROD' ? 'Produkcja' : config?.environment === 'DEMO' ? 'Demo' : 'Test'}</Badge>
                  <span className="text-muted-foreground">NIP: {config?.nip || '—'}</span>
                </div>
                {fetchLogs.length > 0 && (
                  <div className="bg-muted rounded-md p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs font-medium mb-1">Logi połączenia:</p>
                    {fetchLogs.map((l, i) => (
                      <p key={i} className={`text-xs font-mono ${l.startsWith('Błąd') || l.includes('failed') ? 'text-red-600' : 'text-muted-foreground'}`}>{l}</p>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setFetchDialogOpen(false)} disabled={fetching}>Anuluj</Button>
                  <Button onClick={fetchFromKsef} disabled={fetching}>
                    {fetching ? 'Pobieranie...' : 'Pobierz faktury'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nowa faktura</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Nr faktury</Label><Input value={form.invoiceNumber} onChange={(e: any) => setForm(p => ({...(p ?? {}), invoiceNumber: e?.target?.value ?? ''}))} /></div>
                  <div className="space-y-2"><Label>Nr KSeF</Label><Input value={form.ksefNumber} onChange={(e: any) => setForm(p => ({...(p ?? {}), ksefNumber: e?.target?.value ?? ''}))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Data wystawienia</Label><Input type="date" value={form.issueDate} onChange={(e: any) => setForm(p => ({...(p ?? {}), issueDate: e?.target?.value ?? ''}))} /></div>
                  <div className="space-y-2"><Label>NIP sprzedawcy</Label><Input value={form.sellerNip} onChange={(e: any) => setForm(p => ({...(p ?? {}), sellerNip: e?.target?.value ?? ''}))} /></div>
                </div>
                <div className="space-y-2"><Label>Nazwa sprzedawcy</Label><Input value={form.sellerName} onChange={(e: any) => setForm(p => ({...(p ?? {}), sellerName: e?.target?.value ?? ''}))} /></div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Brutto</Label><Input type="number" step="0.01" value={form.grossAmount} onChange={(e: any) => setForm(p => ({...(p ?? {}), grossAmount: e?.target?.value ?? ''}))} /></div>
                  <div className="space-y-2"><Label>Netto</Label><Input type="number" step="0.01" value={form.netAmount} onChange={(e: any) => setForm(p => ({...(p ?? {}), netAmount: e?.target?.value ?? ''}))} /></div>
                  <div className="space-y-2"><Label>VAT</Label><Input type="number" step="0.01" value={form.vatAmount} onChange={(e: any) => setForm(p => ({...(p ?? {}), vatAmount: e?.target?.value ?? ''}))} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={form.isFuel} onCheckedChange={(v: boolean) => setForm(p => ({...(p ?? {}), isFuel: v}))} />
                  <Label>Faktura paliwowa</Label>
                </div>
                {form.isFuel && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Litry paliwa</Label><Input type="number" step="0.01" value={form.fuelLiters} onChange={(e: any) => setForm(p => ({...(p ?? {}), fuelLiters: e?.target?.value ?? ''}))} /></div>
                    <div className="space-y-2"><Label>Cena za litr</Label><Input type="number" step="0.01" value={form.fuelPricePerLiter} onChange={(e: any) => setForm(p => ({...(p ?? {}), fuelPricePerLiter: e?.target?.value ?? ''}))} /></div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
                  <Button onClick={addInvoice}>Zapisz</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Card style={{boxShadow: 'var(--shadow-sm)'}}>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nr faktury</TableHead><TableHead>Data</TableHead><TableHead>Sprzedawca</TableHead>
                  <TableHead className="text-right">Brutto</TableHead><TableHead>Paliwo</TableHead><TableHead>Litry</TableHead><TableHead className="text-right">Akcje</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Wczytywanie...</TableCell></TableRow> :
                  (invoices?.length ?? 0) === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Brak faktur</TableCell></TableRow> :
                  invoices?.map?.((inv: any) => (
                    <TableRow key={inv?.id}>
                      <TableCell className="font-mono text-sm">{inv?.invoiceNumber || inv?.ksefNumber || '-'}</TableCell>
                      <TableCell>{inv?.issueDate ? new Date(inv.issueDate).toLocaleDateString('pl-PL') : '-'}</TableCell>
                      <TableCell>{inv?.sellerName ?? '-'}</TableCell>
                      <TableCell className="text-right font-mono">{inv?.grossAmount?.toFixed?.(2)} zł</TableCell>
                      <TableCell>
                        <button onClick={() => toggleFuel(inv)} className="cursor-pointer">
                          {inv?.isFuel ? <Badge className="bg-green-100 text-green-700"><Fuel className="w-3 h-3 mr-1" />Tak</Badge> : <Badge variant="secondary">Nie</Badge>}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{inv?.fuelLiters ? `${inv.fuelLiters} l` : '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon-sm" onClick={() => deleteInvoice(inv?.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  )) ?? []}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card style={{boxShadow: 'var(--shadow-sm)'}}>
            <CardHeader>
              <CardTitle className="text-lg">Konfiguracja KSeF</CardTitle>
              <CardDescription>Wprowadź dane dostępu do Krajowego Systemu e-Faktur</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={configForm.active} onCheckedChange={(v: boolean) => setConfigForm(p => ({...(p ?? {}), active: v}))} />
                <Label>Aktywna integracja KSeF</Label>
                {config?.hasToken && <Badge className="bg-green-100 text-green-700">Token zapisany</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>NIP firmy</Label><Input value={configForm.nip} onChange={(e: any) => setConfigForm(p => ({...(p ?? {}), nip: e?.target?.value ?? ''}))} placeholder="1234567890" /></div>
                <div className="space-y-2">
                  <Label>Środowisko</Label>
                  <Select value={configForm.environment} onValueChange={(v: string) => setConfigForm(p => ({...(p ?? {}), environment: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="TEST">Testowe</SelectItem><SelectItem value="DEMO">Demo (przedprodukcyjne)</SelectItem><SelectItem value="PROD">Produkcyjne</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Token autoryzacyjny KSeF</Label>
                <Input type="password" value={configForm.token} onChange={(e: any) => setConfigForm(p => ({...(p ?? {}), token: e?.target?.value ?? ''}))} placeholder={config?.hasToken ? '******** (zapisany)' : 'Wklej token'} />
                <p className="text-xs text-muted-foreground">Token jest przechowywany w zaszyfrowanej formie w bazie danych</p>
              </div>
              {isAdmin && <Button onClick={saveConfig}><Save className="w-4 h-4 mr-1" /> Zapisz konfigurację</Button>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
