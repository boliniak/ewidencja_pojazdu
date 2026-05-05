'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Car, FileText, Fuel, AlertTriangle, TrendingUp, Receipt } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardStats {
  vehicleCount: number;
  entryCount: number;
  totalKm: number;
  fuelPurchaseCount: number;
  invoiceCount: number;
  avgConsumption: number | null;
}

export function DashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => setStats(d ?? null))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Pojazdy', value: stats?.vehicleCount ?? 0, icon: Car, color: 'text-blue-600 bg-blue-50' },
    { label: 'Wpisy ewidencji', value: stats?.entryCount ?? 0, icon: FileText, color: 'text-green-600 bg-green-50' },
    { label: 'Łącznie km', value: stats?.totalKm?.toFixed?.(0) ?? '0', icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    { label: 'Zakupy paliwa', value: stats?.fuelPurchaseCount ?? 0, icon: Fuel, color: 'text-orange-600 bg-orange-50' },
    { label: 'Faktury KSeF', value: stats?.invoiceCount ?? 0, icon: Receipt, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Śr. spalanie (l/100km)', value: stats?.avgConsumption?.toFixed?.(1) ?? 'Brak danych', icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold tracking-tight">Pulpit</h1>
        <p className="text-muted-foreground">Przegląd systemu ewidencji przebiegu pojazdów</p>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards?.map?.((card: any, i: number) => {
            const Icon = card?.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className="hover:shadow-md transition-shadow" style={{boxShadow: 'var(--shadow-sm)'}}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card?.color}`}>
                        {Icon && <Icon className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{card?.label}</p>
                        <p className="text-2xl font-bold font-mono">{card?.value}</p>
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
