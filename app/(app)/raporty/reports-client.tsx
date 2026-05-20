'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ReportsClient() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch('/api/vehicles').then(r => r.json()).then(d => { setVehicles(d ?? []); if (d?.[0]?.id) setVehicleId(d[0].id); }).catch(() => {});
  }, []);

  const months = [
    { v: '', l: 'Cały rok' },
    { v: '1', l: 'Styczeń' }, { v: '2', l: 'Luty' }, { v: '3', l: 'Marzec' },
    { v: '4', l: 'Kwiecień' }, { v: '5', l: 'Maj' }, { v: '6', l: 'Czerwiec' },
    { v: '7', l: 'Lipiec' }, { v: '8', l: 'Sierpień' }, { v: '9', l: 'Wrzesień' },
    { v: '10', l: 'Październik' }, { v: '11', l: 'Listopad' }, { v: '12', l: 'Grudzień' },
  ];

  const generatePdf = async () => {
    if (!vehicleId) { toast.error('Wybierz pojazd'); return; }
    setGenerating(true);
    try {
      const res = await fetch('/api/reports/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, year, month: month || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? 'Błąd generowania');
        return;
      }
      const contentType = res.headers.get('Content-Type') ?? '';
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      
      if (contentType.includes('text/html')) {
        // Fallback: otwórz HTML w nowej karcie do wydruku (Ctrl+P)
        const w = window.open(url, '_blank');
        if (w) {
          toast.success('Raport otwarty w nowej karcie. Użyj Ctrl+P aby zapisać jako PDF.');
        } else {
          toast.error('Przeglądarka zablokowała otwarcie nowej karty. Odblokuj popup.');
        }
      } else {
        // PDF — pobierz normalnie
        const a = document.createElement('a');
        a.href = url;
        a.download = `ewidencja_${year}${month ? '_' + month : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success('PDF wygenerowany i pobrany');
      }
    } catch { toast.error('Błąd'); }
    finally { setGenerating(false); }
  };

  const exportJson = async () => {
    try {
      const res = await fetch('/api/backup/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ewidencja_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Dane wyeksportowane');
    } catch { toast.error('Błąd eksportu'); }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold tracking-tight">Raporty</h1>
        <p className="text-muted-foreground">Generowanie raportów ewidencji przebiegu i eksport danych</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card style={{boxShadow: 'var(--shadow-sm)'}}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5" /> Raport ewidencji PDF</CardTitle>
            <CardDescription>Wygeneruj ewidencję przebiegu w formacie PDF zgodnym z ustawą</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Pojazd</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
                <SelectContent>
                  {vehicles?.map?.((v: any) => <SelectItem key={v?.id} value={v?.id}>{v?.registrationNumber} {v?.brand} {v?.model}</SelectItem>) ?? []}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rok</Label>
                <Input type="number" value={year} onChange={(e: any) => setYear(e?.target?.value ?? '')} />
              </div>
              <div className="space-y-2">
                <Label>Miesiąc</Label>
                <Select value={month || 'all'} onValueChange={(v: string) => setMonth(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months?.map?.((m: any) => <SelectItem key={m?.v ?? 'all'} value={m?.v || 'all'}>{m?.l}</SelectItem>) ?? []}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={generatePdf} loading={generating} className="w-full">
              <Download className="w-4 h-4 mr-1" /> Generuj PDF
            </Button>
          </CardContent>
        </Card>

        <Card style={{boxShadow: 'var(--shadow-sm)'}}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Eksport danych</CardTitle>
            <CardDescription>Eksportuj wszystkie dane ewidencji do pliku JSON</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Eksport zawiera: pojazdy, wpisy ewidencji, zakupy paliwa, faktury KSeF, ustawienia systemu.</p>
            <Button variant="outline" onClick={exportJson} className="w-full">
              <Download className="w-4 h-4 mr-1" /> Eksportuj JSON
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
