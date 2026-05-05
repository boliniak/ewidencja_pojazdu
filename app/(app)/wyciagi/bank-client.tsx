'use client';
import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Building2, Upload, Fuel, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export function BankClient() {
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchStatements = () => {
    fetch('/api/bank/statements').then(r => r.json()).then(d => setStatements(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetchStatements(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/bank/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? 'B\u0142\u0105d'); return; }
      toast.success(`Zaimportowano ${data?.transactionCount ?? 0} transakcji`);
      if (data?.parseError) toast.warning(data.parseError);
      fetchStatements();
    } catch { toast.error('B\u0142\u0105d uploadu'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const toggleFuel = async (txId: string, current: boolean) => {
    await fetch(`/api/bank/transactions/${txId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isFuel: !current }) });
    fetchStatements();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Wyci\u0105gi bankowe</h1>
          <p className="text-muted-foreground">Import wyci\u0105g\u00f3w PKO BP i identyfikacja transakcji paliwowych</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
          <Button onClick={() => fileRef?.current?.click?.()} loading={uploading}>
            <Upload className="w-4 h-4 mr-1" /> Importuj PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">{[1,2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : (statements?.length ?? 0) === 0 ? (
        <Card style={{boxShadow: 'var(--shadow-sm)'}}>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Brak zaimportowanych wyci\u0105g\u00f3w</p>
            <p className="text-sm">Kliknij "Importuj PDF" aby przes\u0142a\u0107 wyci\u0105g bankowy PKO BP</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {statements?.map?.((st: any) => {
            const isExpanded = expandedId === st?.id;
            const fuelTxs = st?.transactions?.filter?.((t: any) => t?.isFuel) ?? [];
            const fuelTotal = fuelTxs?.reduce?.((s: number, t: any) => s + Math.abs(t?.amount ?? 0), 0) ?? 0;
            return (
              <Card key={st?.id} style={{boxShadow: 'var(--shadow-sm)'}}>
                <CardHeader className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : st?.id)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {st?.fileName}
                      </CardTitle>
                      <CardDescription>
                        Okres: {st?.periodFrom ? new Date(st.periodFrom).toLocaleDateString('pl-PL') : '?'} \u2013 {st?.periodTo ? new Date(st.periodTo).toLocaleDateString('pl-PL') : '?'}
                        {' \u2022 '}{st?.transactions?.length ?? 0} transakcji
                        {fuelTxs?.length > 0 && <> \u2022 <span className="text-green-600">{fuelTxs.length} paliwowych ({fuelTotal?.toFixed?.(2)} z\u0142)</span></>}
                      </CardDescription>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Data</TableHead><TableHead>Typ</TableHead><TableHead>Opis</TableHead>
                        <TableHead className="text-right">Kwota</TableHead><TableHead>Paliwo</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {st?.transactions?.map?.((tx: any) => (
                          <TableRow key={tx?.id} className={tx?.isFuel ? 'bg-green-50/50' : ''}>
                            <TableCell className="whitespace-nowrap text-sm">{tx?.operationDate ? new Date(tx.operationDate).toLocaleDateString('pl-PL') : '-'}</TableCell>
                            <TableCell className="text-xs max-w-[150px] truncate">{tx?.operationType}</TableCell>
                            <TableCell className="text-sm max-w-xs truncate">{tx?.description}</TableCell>
                            <TableCell className={`text-right font-mono whitespace-nowrap ${(tx?.amount ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {tx?.amount?.toFixed?.(2)} z\u0142
                            </TableCell>
                            <TableCell>
                              <button onClick={() => toggleFuel(tx?.id, tx?.isFuel)} className="cursor-pointer">
                                {tx?.isFuel ?
                                  <Badge className="bg-green-100 text-green-700"><Fuel className="w-3 h-3 mr-1" />{tx?.stationName ?? 'Paliwo'}</Badge> :
                                  <Badge variant="secondary" className="text-xs">\u2014</Badge>
                                }
                              </button>
                            </TableCell>
                          </TableRow>
                        )) ?? []}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          }) ?? []}
        </div>
      )}
    </div>
  );
}
