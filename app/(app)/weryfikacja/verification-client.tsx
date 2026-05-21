'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, XCircle, Fuel, TrendingUp, Car, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface VerificationResult {
  vehicle: { id: string; registrationNumber: string; brand: string; model: string };
  totalKm: number;
  totalLiters: number;
  totalFuelCost: number;
  avgConsumption: number | null;
  entryCount: number;
  fuelCount: number;
  status: string;
  minConsumption: number;
  maxConsumption: number;
  ksefLitersPeriod: number;
  maxAllowedLiters: number | null;
  litersOverLimit: number;
  allTime: {
    totalKm: number;
    totalLiters: number;
    ksefLiters: number;
    avgConsumption: number | null;
  };
}

export function VerificationClient() {
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');

  const fetchData = () => {
    setLoading(true);
    let url = '/api/verification?';
    if (year) url += `year=${year}&`;
    if (month && month !== 'all') url += `month=${month}&`;
    fetch(url).then(r => r.json()).then(d => setResults(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [year, month]);

  const statusConfig: Record<string, { icon: any; label: string; color: string; badge: string }> = {
    OK: { icon: CheckCircle, label: 'W normie', color: 'text-green-600', badge: 'bg-green-100 text-green-700' },
    ZA_NISKIE: { icon: AlertTriangle, label: 'Za niskie spalanie', color: 'text-orange-600', badge: 'bg-orange-100 text-orange-700' },
    ZA_WYSOKIE: { icon: XCircle, label: 'Za wysokie spalanie', color: 'text-red-600', badge: 'bg-red-100 text-red-700' },
    BRAK_DANYCH: { icon: Fuel, label: 'Brak danych', color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500' },
  };

  const months = [
    { v: 'all', l: 'Cały rok' },
    { v: '1', l: 'Styczeń' }, { v: '2', l: 'Luty' }, { v: '3', l: 'Marzec' },
    { v: '4', l: 'Kwiecień' }, { v: '5', l: 'Maj' }, { v: '6', l: 'Czerwiec' },
    { v: '7', l: 'Lipiec' }, { v: '8', l: 'Sierpień' }, { v: '9', l: 'Wrzesień' },
    { v: '10', l: 'Październik' }, { v: '11', l: 'Listopad' }, { v: '12', l: 'Grudzień' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold tracking-tight">Weryfikacja spalania</h1>
        <p className="text-muted-foreground">Porównanie kilometrów z ewidencji z ilością zatankowanego paliwa</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <Input type="number" value={year} onChange={(e: any) => setYear(e?.target?.value ?? '')} className="w-24" placeholder="Rok" />
        <Select value={month || 'all'} onValueChange={(v: string) => setMonth(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months?.map?.((m: any) => <SelectItem key={m?.v} value={m?.v}>{m?.l}</SelectItem>) ?? []}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="w-4 h-4 mr-1" /> Odśwież</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : (results?.length ?? 0) === 0 ? (
        <Card style={{boxShadow: 'var(--shadow-sm)'}}>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Car className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Brak aktywnych pojazdów do weryfikacji</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results?.map?.((r: VerificationResult, i: number) => {
            const sc = statusConfig?.[r?.status] ?? statusConfig.BRAK_DANYCH;
            const Icon = sc?.icon;
            return (
              <motion.div key={r?.vehicle?.id ?? i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card style={{boxShadow: 'var(--shadow-sm)'}} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Car className="w-5 h-5" />
                        {r?.vehicle?.registrationNumber}
                      </CardTitle>
                      <Badge className={sc?.badge}>{Icon && <Icon className="w-3 h-3 mr-1" />}{sc?.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{[r?.vehicle?.brand, r?.vehicle?.model].filter(Boolean).join(' ')}</p>
                  </CardHeader>
                  <CardContent>
                    {/* Wybrany okres */}
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Wybrany okres</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Przejechano</span><span className="font-mono font-bold">{r?.totalKm?.toFixed?.(1) ?? '0'} km</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Wpisy ewidencji</span><span className="font-mono">{r?.entryCount ?? 0}</span></div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Zatankowano</span><span className="font-mono font-bold">{r?.totalLiters?.toFixed?.(1) ?? '0'} l</span></div>
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Koszt paliwa</span><span className="font-mono">{r?.totalFuelCost?.toFixed?.(2) ?? '0'} zł</span></div>
                      </div>
                    </div>

                    {/* Limit litrów */}
                    {r?.maxAllowedLiters !== null && r?.maxAllowedLiters !== undefined && (
                      <div className="mt-3 p-2 rounded-lg bg-muted/50 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Maks. dopuszczalne litry</span>
                          <span className="font-mono">{r.maxAllowedLiters.toFixed(1)} l</span>
                        </div>
                        {r?.litersOverLimit > 0 && (
                          <div className="flex justify-between text-red-600 font-medium mt-1">
                            <span>⚠ Przekroczenie limitu</span>
                            <span className="font-mono">+{r.litersOverLimit.toFixed(1)} l</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* KSeF litry w okresie */}
                    {(r?.ksefLitersPeriod ?? 0) > 0 && (
                      <div className="mt-2 flex justify-between text-sm">
                        <span className="text-muted-foreground">Litry z FV KSeF (okres)</span>
                        <span className="font-mono">{r.ksefLitersPeriod.toFixed(1)} l</span>
                      </div>
                    )}

                    {/* Spalanie */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Średnie spalanie</span>
                        <span className={`text-xl font-mono font-bold ${sc?.color}`}>
                          {r?.avgConsumption?.toFixed?.(1) ?? '—'} l/100km
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Norma: {r?.minConsumption}–{r?.maxConsumption} l/100km</p>
                      {r?.avgConsumption !== null && r?.avgConsumption !== undefined && (
                        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${r?.status === 'OK' ? 'bg-green-500' : r?.status === 'ZA_NISKIE' ? 'bg-orange-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(((r?.avgConsumption ?? 0) / (r?.maxConsumption * 1.5)) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Od początku ewidencji */}
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Od początku ewidencji</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Łącznie km</span><span className="font-mono">{r?.allTime?.totalKm?.toFixed?.(1) ?? '0'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Łącznie litrów</span><span className="font-mono">{r?.allTime?.totalLiters?.toFixed?.(1) ?? '0'}</span></div>
                        {(r?.allTime?.ksefLiters ?? 0) > 0 && (
                          <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Litry z KSeF (FV paliw.)</span><span className="font-mono">{r.allTime.ksefLiters.toFixed(1)} l</span></div>
                        )}
                        <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Śr. spalanie (cały okres)</span>
                          <span className="font-mono font-medium">{r?.allTime?.avgConsumption?.toFixed?.(1) ?? '—'} l/100km</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          }) ?? []}
        </div>
      )}
    </div>
  );
}
