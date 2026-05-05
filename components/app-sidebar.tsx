'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import {
  LayoutDashboard, Car, FileText, Users, Receipt, Building2,
  CheckCircle, BarChart3, Settings, LogOut, Menu, X, ChevronDown
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Pulpit', icon: LayoutDashboard },
  { href: '/ewidencja', label: 'Ewidencja', icon: FileText },
  { href: '/pojazdy', label: 'Pojazdy', icon: Car },
  { href: '/uzytkownicy', label: 'Użytkownicy', icon: Users },
  { href: '/ksef', label: 'KSeF / Faktury', icon: Receipt },
  { href: '/wyciagi', label: 'Wyciągi bankowe', icon: Building2 },
  { href: '/weryfikacja', label: 'Weryfikacja', icon: CheckCircle },
  { href: '/raporty', label: 'Raporty', icon: BarChart3 },
  { href: '/ustawienia', label: 'Ustawienia', icon: Settings },
];

export function AppSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession() || {};
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setOpen(false)} />}
      
      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-card border-r flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )} style={{boxShadow: 'var(--shadow-md)'}}>
        <div className="p-4 border-b flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Car className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-bold text-sm truncate">Ewidencja</h2>
            <p className="text-xs text-muted-foreground truncate">Przebieg pojazdów</p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems?.map((item: any) => {
            const Icon = item?.icon;
            const isActive = pathname === item?.href || pathname?.startsWith?.(`${item?.href}/`);
            return (
              <Link key={item?.href} href={item?.href ?? '#'} onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}>
                {Icon && <Icon className="w-4 h-4 shrink-0" />}
                <span>{item?.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {session?.user?.name?.[0]?.toUpperCase?.() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session?.user?.name ?? 'Użytkownik'}</p>
              <p className="text-xs text-muted-foreground truncate">{session?.user?.email ?? ''}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => signOut?.({ callbackUrl: '/' })}>
            <LogOut className="w-4 h-4 mr-2" /> Wyloguj się
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-sm border-b px-4 py-3 flex items-center gap-3 lg:hidden">
          <button onClick={() => setOpen(true)}><Menu className="w-5 h-5" /></button>
          <span className="font-display font-bold text-sm">Ewidencja Przebiegu</span>
        </header>
        <div className="p-4 md:p-6 lg:p-8 max-w-[1200px]">
          {children}
        </div>
      </main>
    </div>
  );
}
