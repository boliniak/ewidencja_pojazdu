'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus, Pencil, Trash2, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  purpose: string;
  kilometers: number;
  odometerBefore: number | null;
  odometerAfter: number | null;
  taxpayerSignature: string;
  vehicle: { id: string; registrationNumber: string } | null;
  user: { id: string; name: string } | null;
}

export function EntriesClient() {
  const { data: session } = useSession() || {};
  const [entries, setEntries] = useState<Entry[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [filterVehicle, setFilterVehicle] = useState('all');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [form, setForm] = useState({ date: '', purpose: '', kilometers: '', vehicleId: '', userId: '', taxpayerSignature: '' });

  const fetchEntries = () => {
    let url = '/api/entries?';
    if (filterVehicle && filterVehicle !== 'all') url += `vehicleId=${filterVehicle}&`;
    if (filterMonth) url += `month=${filterMonth}&`;
    if (filterYear) url += `year=${filterYear}&`;
    fetch(url).then(r => r.json()).then(d => setEntries(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(d => setVehicles(d ?? [])).catch(() => {});
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => { fetchEntries(); }, [filterVehicle, filterMonth, filterYear]);

  const openNew = () => {
    setEditEntry(null);
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    setForm({
      date: dateStr,
      purpose: '', kilometers: '',
      vehicleId: vehicles?.[0]?.id ?? '',
      userId: (session?.user as any)?.id ?? '',
      taxpayerSignature: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (e: Entry) => {
    setEditEntry(e);
    setForm({
      date: e?.date ? new Date(e.date).toISOString().split('T')[0] : '',
      purpose: e?.purpose ?? '',
      kilometers: String(e?.kilometers ?? ''),
      vehicleId: e?.vehicle?.id ?? '',
      userId: e?.user?.id ?? '',
      taxpayerSignature: e?.taxpayerSignature ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const url = editEntry ? `/api/entries/${editEntry.id}` : '/api/entries';
      const method = editEntry ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? 'Błąd'); return; }
      toast.success(editEntry ? 'Wpis zaktualizowany' : 'Wpis dodany');
      setDialogOpen(false);
      fetchEntries();
    } catch { toast.error('Błąd'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć wpis?')) return;
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    toast.success('Wpis usunięty');
    fetchEntries();
  };

  const months = [
    { v: '', l: 'Wszystkie' },
    { v: '1', l: 'Styczeń' }, { v: '2', l: 'Luty' }, { v: '3', l: 'Marzec' },
    { v: '4', l: 'Kwiecień' }, { v: '5', l: 'Maj' }, { v: '6', l: 'Czerwiec' },
    { v: '7', l: 'Lipiec' }, { v: '8', l: 'Sierpień' }, { v: '9', l: 'Wrzesień' },
    { v: '10', l: 'Październik' }, { v: '11', l: 'Listopad' }, { v: '12', l: 'Grudzień' },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Ewidencja przebiegu</h1>
          <p className="text-muted-foreground">Numerowane wpisy zgodne z wymogami ustawowymi</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nowy wpis</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterVehicle} onValueChange={setFilterVehicle}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Pojazd" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie pojazdy</SelectItem>
            {vehicles?.map?.((v: any) => <SelectItem key={v?.id} value={v?.id}>{v?.registrationNumber}</SelectItem>) ?? []}
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Miesiąc" /></SelectTrigger>
          <SelectContent>
            {months?.map?.((m: any) => <SelectItem key={m?.v ?? 'all'} value={m?.v || 'all'}>{m?.l}</SelectItem>) ?? []}
          </SelectContent>
        </Select>
        <Input type="number" value={filterYear} onChange={(e: any) => setFilterYear(e?.target?.value ?? '')} placeholder="Rok" className="w-24" />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editEntry ? 'Edytuj wpis' : 'Nowy wpis ewidencji'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data *</Label>
                <Input type="date" value={form.date} onChange={(e: any) => setForm(p => ({...(p ?? {}), date: e?.target?.value ?? ''}))} />
              </div>
              <div className="space-y-2">
                <Label>Kilometry *</Label>
                <Input type="number" step="0.1" value={form.kilometers} onChange={(e: any) => setForm(p => ({...(p ?? {}), kilometers: e?.target?.value ?? ''}))} placeholder="np. 120" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cel wyjazdu *</Label>
              <Textarea value={form.purpose} onChange={(e: any) => setForm(p => ({...(p ?? {}), purpose: e?.target?.value ?? ''}))} placeholder="Opis celu wyjazdu" rows={2} />
            </div>
            {!editEntry && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pojazd *</Label>
                  <Select value={form.vehicleId} onValueChange={(v: string) => setForm(p => ({...(p ?? {}), vehicleId: v}))}>
                    <SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
                    <SelectContent>
                      {vehicles?.map?.((v: any) => <SelectItem key={v?.id} value={v?.id}>{v?.registrationNumber}</SelectItem>) ?? []}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pracownik</Label>
                  <Select value={form.userId} onValueChange={(v: string) => setForm(p => ({...(p ?? {}), userId: v}))}>
                    <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
                    <SelectContent>
                      {users?.map?.((u: any) => <SelectItem key={u?.id} value={u?.id}>{u?.name}</SelectItem>) ?? []}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Podpis podatnika</Label>
              <Input value={form.taxpayerSignature} onChange={(e: any) => setForm(p => ({...(p ?? {}), taxpayerSignature: e?.target?.value ?? ''}))} placeholder="Imię i nazwisko podatnika" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button onClick={handleSave}>Zapisz</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card style={{boxShadow: 'var(--shadow-sm)'}}>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Nr</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Cel wyjazdu</TableHead>
                <TableHead>Pojazd</TableHead>
                <TableHead>Pracownik</TableHead>
                <TableHead className="text-right">km</TableHead>
                <TableHead className="text-right">Licznik przed</TableHead>
                <TableHead className="text-right">Licznik po</TableHead>
                <TableHead>Podpis</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Wczytywanie...</TableCell></TableRow>
              ) : (entries?.length ?? 0) === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Brak wpisów ewidencji</TableCell></TableRow>
              ) : (
                entries?.map?.((e: Entry) => (
                  <TableRow key={e?.id}>
                    <TableCell className="font-mono font-bold">{e?.entryNumber}</TableCell>
                    <TableCell>{e?.date ? new Date(e.date).toLocaleDateString('pl-PL') : '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{e?.purpose}</TableCell>
                    <TableCell className="font-mono text-sm">{e?.vehicle?.registrationNumber ?? '-'}</TableCell>
                    <TableCell>{e?.user?.name ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono">{e?.kilometers?.toFixed?.(1)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{e?.odometerBefore?.toLocaleString?.('pl-PL') ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{e?.odometerAfter?.toLocaleString?.('pl-PL') ?? '-'}</TableCell>
                    <TableCell className="text-sm">{e?.taxpayerSignature || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(e?.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                )) ?? []
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(entries?.length ?? 0) > 0 && (
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span>Łącznie wpisów: <strong className="text-foreground">{entries?.length ?? 0}</strong></span>
          <span>Łącznie km: <strong className="text-foreground font-mono">{entries?.reduce?.((s: number, e: Entry) => s + (e?.kilometers ?? 0), 0)?.toFixed?.(1) ?? '0'}</strong></span>
        </div>
      )}
    </div>
  );
}
