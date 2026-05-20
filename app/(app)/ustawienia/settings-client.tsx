'use client';
import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, Download, Upload, Database, History } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

export function SettingsClient() {
  const { data: session } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [backupLogs, setBackupLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d ?? {})).catch(() => {}).finally(() => setLoading(false));
    fetch('/api/backup/logs').then(r => r.json()).then(d => setBackupLogs(d ?? [])).catch(() => {});
  }, []);

  const saveSettings = async () => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    if (res.ok) toast.success('Ustawienia zapisane'); else toast.error('Błąd');
  };

  const exportData = async () => {
    try {
      const res = await fetch('/api/backup/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Backup wyeksportowany');
      fetch('/api/backup/logs').then(r => r.json()).then(d => setBackupLogs(d ?? []));
    } catch { toast.error('Błąd'); }
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/backup/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      if (res.ok) {
        toast.success(`Import zakończony: ${result?.imported?.vehicles ?? 0} pojazdów, ${result?.imported?.settings ?? 0} ustawień`);
        fetch('/api/backup/logs').then(r => r.json()).then(d => setBackupLogs(d ?? []));
      } else toast.error(result?.error ?? 'Błąd importu');
    } catch { toast.error('Błąd parsowania pliku'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...(prev ?? {}), [key]: value }));
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold tracking-tight">Ustawienia</h1>
        <p className="text-muted-foreground">Konfiguracja systemu, parametry i kopia zapasowa</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general"><Settings className="w-4 h-4 mr-1" /> Ogólne</TabsTrigger>
          <TabsTrigger value="backup"><Database className="w-4 h-4 mr-1" /> Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card style={{boxShadow: 'var(--shadow-sm)'}}>
            <CardHeader>
              <CardTitle className="text-lg">Parametry systemu</CardTitle>
              <CardDescription>Ustawienia ogólne i parametry weryfikacji spalania</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nazwa firmy</Label>
                  <Input value={settings?.COMPANY_NAME ?? ''} onChange={(e: any) => updateSetting('COMPANY_NAME', e?.target?.value ?? '')} placeholder="Nazwa firmy" />
                </div>
                <div className="space-y-2">
                  <Label>NIP firmy</Label>
                  <Input value={settings?.COMPANY_NIP ?? ''} onChange={(e: any) => updateSetting('COMPANY_NIP', e?.target?.value ?? '')} placeholder="1234567890" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min. spalanie (l/100km)</Label>
                  <Input type="number" step="0.1" value={settings?.MIN_CONSUMPTION ?? '10'} onChange={(e: any) => updateSetting('MIN_CONSUMPTION', e?.target?.value ?? '10')} />
                </div>
                <div className="space-y-2">
                  <Label>Maks. spalanie (l/100km)</Label>
                  <Input type="number" step="0.1" value={settings?.MAX_CONSUMPTION ?? '14'} onChange={(e: any) => updateSetting('MAX_CONSUMPTION', e?.target?.value ?? '14')} />
                </div>
              </div>
              {isAdmin && <Button onClick={saveSettings}><Save className="w-4 h-4 mr-1" /> Zapisz ustawienia</Button>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card style={{boxShadow: 'var(--shadow-sm)'}}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Download className="w-5 h-5" /> Eksport danych</CardTitle>
                <CardDescription>Pobierz kopię zapasową wszystkich danych</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={exportData} className="w-full"><Download className="w-4 h-4 mr-1" /> Eksportuj backup (JSON)</Button>
              </CardContent>
            </Card>
            <Card style={{boxShadow: 'var(--shadow-sm)'}}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Upload className="w-5 h-5" /> Import danych</CardTitle>
                <CardDescription>Przywróć dane z kopii zapasowej</CardDescription>
              </CardHeader>
              <CardContent>
                <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importData} />
                <Button variant="outline" onClick={() => fileRef?.current?.click?.()} className="w-full" disabled={!isAdmin}>
                  <Upload className="w-4 h-4 mr-1" /> Importuj backup (JSON)
                </Button>
                {!isAdmin && <p className="text-xs text-muted-foreground mt-2">Tylko administrator może importować dane</p>}
              </CardContent>
            </Card>
          </div>

          <Card style={{boxShadow: 'var(--shadow-sm)'}}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5" /> Historia backupów</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Typ</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(backupLogs?.length ?? 0) === 0 ?
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Brak historii</TableCell></TableRow> :
                    backupLogs?.map?.((log: any) => (
                      <TableRow key={log?.id}>
                        <TableCell className="text-sm">{log?.createdAt ? new Date(log.createdAt).toLocaleString('pl-PL') : '-'}</TableCell>
                        <TableCell><Badge variant="secondary">{log?.type ?? '-'}</Badge></TableCell>
                        <TableCell><Badge className={log?.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{log?.status ?? '-'}</Badge></TableCell>
                      </TableRow>
                    )) ?? []
                  }
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
