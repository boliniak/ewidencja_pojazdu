'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, Plus, Pencil, Trash2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

interface Vehicle {
  id: string;
  registrationNumber: string;
  brand: string;
  model: string;
  startDate: string;
  endDate: string | null;
  odometerStart: number;
  odometerEnd: number | null;
  active: boolean;
}

export function VehiclesClient() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({ registrationNumber: '', brand: '', model: '', startDate: '', endDate: '', odometerStart: '0', odometerEnd: '' });

  const fetchVehicles = () => {
    fetch('/api/vehicles').then(r => r.json()).then(d => setVehicles(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchVehicles(); }, []);

  const openNew = () => {
    setEditVehicle(null);
    setForm({ registrationNumber: '', brand: '', model: '', startDate: new Date().toISOString().split('T')[0] ?? '', endDate: '', odometerStart: '0', odometerEnd: '' });
    setDialogOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v);
    setForm({
      registrationNumber: v?.registrationNumber ?? '',
      brand: v?.brand ?? '',
      model: v?.model ?? '',
      startDate: v?.startDate ? new Date(v.startDate).toISOString().split('T')[0] : '',
      endDate: v?.endDate ? new Date(v.endDate).toISOString().split('T')[0] : '',
      odometerStart: String(v?.odometerStart ?? 0),
      odometerEnd: v?.odometerEnd ? String(v.odometerEnd) : '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const url = editVehicle ? `/api/vehicles/${editVehicle.id}` : '/api/vehicles';
      const method = editVehicle ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? 'Błąd'); return; }
      toast.success(editVehicle ? 'Pojazd zaktualizowany' : 'Pojazd dodany');
      setDialogOpen(false);
      fetchVehicles();
    } catch { toast.error('Błąd'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno usunąć ten pojazd?')) return;
    try {
      await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
      toast.success('Pojazd usunięty');
      fetchVehicles();
    } catch { toast.error('Błąd'); }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('pl-PL'); } catch { return '-'; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Pojazdy</h1>
          <p className="text-muted-foreground">Zarządzanie pojazdami w ewidencji (maks. 10)</p>
        </div>
        <Button onClick={openNew} disabled={(vehicles?.length ?? 0) >= 10}><Plus className="w-4 h-4 mr-1" /> Dodaj pojazd</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editVehicle ? 'Edytuj pojazd' : 'Nowy pojazd'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nr rejestracyjny *</Label>
                <Input value={form.registrationNumber} onChange={(e: any) => setForm(p => ({...(p ?? {}), registrationNumber: e?.target?.value ?? ''}))} placeholder="WND 12345" />
              </div>
              <div className="space-y-2">
                <Label>Marka</Label>
                <Input value={form.brand} onChange={(e: any) => setForm(p => ({...(p ?? {}), brand: e?.target?.value ?? ''}))} placeholder="Toyota" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={form.model} onChange={(e: any) => setForm(p => ({...(p ?? {}), model: e?.target?.value ?? ''}))} placeholder="Corolla" />
              </div>
              <div className="space-y-2">
                <Label>Data rozpoczęcia *</Label>
                <Input type="date" value={form.startDate} onChange={(e: any) => setForm(p => ({...(p ?? {}), startDate: e?.target?.value ?? ''}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data zakończenia</Label>
                <Input type="date" value={form.endDate} onChange={(e: any) => setForm(p => ({...(p ?? {}), endDate: e?.target?.value ?? ''}))} />
              </div>
              <div className="space-y-2">
                <Label>Stan licznika początkowy (km)</Label>
                <Input type="number" value={form.odometerStart} onChange={(e: any) => setForm(p => ({...(p ?? {}), odometerStart: e?.target?.value ?? '0'}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stan licznika końcowy (km)</Label>
              <Input type="number" value={form.odometerEnd} onChange={(e: any) => setForm(p => ({...(p ?? {}), odometerEnd: e?.target?.value ?? ''}))} placeholder="Opcjonalnie" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
              <Button onClick={handleSave}>Zapisz</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card style={{boxShadow: 'var(--shadow-sm)'}}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr rejestracyjny</TableHead>
                <TableHead>Marka / Model</TableHead>
                <TableHead>Okres ewidencji</TableHead>
                <TableHead>Licznik pocz.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Wczytywanie...</TableCell></TableRow>
              ) : (vehicles?.length ?? 0) === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Brak pojazdów. Dodaj pierwszy pojazd.</TableCell></TableRow>
              ) : (
                vehicles?.map?.((v: Vehicle) => (
                  <TableRow key={v?.id}>
                    <TableCell className="font-mono font-bold">{v?.registrationNumber}</TableCell>
                    <TableCell>{[v?.brand, v?.model].filter(Boolean).join(' ') || '-'}</TableCell>
                    <TableCell className="text-sm">{formatDate(v?.startDate)} – {formatDate(v?.endDate)}</TableCell>
                    <TableCell className="font-mono">{v?.odometerStart?.toLocaleString?.('pl-PL') ?? 0} km</TableCell>
                    <TableCell><Badge variant={v?.active ? 'default' : 'secondary'}>{v?.active ? 'Aktywny' : 'Nieaktywny'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(v)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(v?.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                )) ?? []
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
