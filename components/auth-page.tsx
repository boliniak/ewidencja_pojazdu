'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Car, LogIn, UserPlus, Mail, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) {
        toast.error('Nieprawidłowy email lub hasło');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      toast.error('Błąd logowania');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password?.length < 6) { toast.error('Hasło musi mieć min. 6 znaków'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? 'Błąd rejestracji'); return; }
      const loginRes = await signIn('credentials', { email, password, redirect: false });
      if (loginRes?.error) { toast.error('Konto utworzone, zaloguj się ręcznie'); setMode('login'); }
      else { router.replace('/dashboard'); }
    } catch { toast.error('Błąd rejestracji'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4" style={{boxShadow: 'var(--shadow-lg)'}}>
            <Car className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Ewidencja Przebiegu</h1>
          <p className="text-muted-foreground mt-1">System ewidencji przebiegu pojazdów</p>
        </div>
        <Card style={{boxShadow: 'var(--shadow-lg)'}}>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{mode === 'login' ? 'Logowanie' : 'Rejestracja'}</CardTitle>
            <CardDescription>{mode === 'login' ? 'Zaloguj się do systemu' : 'Utwórz nowe konto'}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-4">
              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="name">Imię i nazwisko</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="name" value={name} onChange={(e: any) => setName(e?.target?.value ?? '')} placeholder="Jan Kowalski" className="pl-10" required />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="email" type="email" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} placeholder="email@firma.pl" className="pl-10" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Hasło</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input id="password" type="password" value={password} onChange={(e: any) => setPassword(e?.target?.value ?? '')} placeholder="Min. 6 znaków" className="pl-10" required />
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                {mode === 'login' ? <><LogIn className="w-4 h-4" /> Zaloguj się</> : <><UserPlus className="w-4 h-4" /> Zarejestruj się</>}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              {mode === 'login' ? (
                <span>Nie masz konta?{' '}<button type="button" onClick={() => setMode('signup')} className="text-primary font-medium hover:underline">Zarejestruj się</button></span>
              ) : (
                <span>Masz już konto?{' '}<button type="button" onClick={() => setMode('login')} className="text-primary font-medium hover:underline">Zaloguj się</button></span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
