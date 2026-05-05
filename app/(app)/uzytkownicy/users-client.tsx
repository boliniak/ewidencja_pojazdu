'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

export function UsersClient() {
  const { data: session } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'USER' });

  const fetchUsers = () => {
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d ?? [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetchUsers(); }, []);

  const openNew = () => { setEditUser(null); setForm({ name: '', email: '', password: '', role: 'USER' }); setDialogOpen(true); };
  const openEdit = (u: any) => { setEditUser(u); setForm({ name: u?.name ?? '', email: u?.email ?? '', password: '', role: u?.role ?? 'USER' }); setDialogOpen(true); };

  const handleSave = async () => {
    const url = editUser ? `/api/users/${editUser.id}` : '/api/users';
    const method = editUser ? 'PUT' : 'POST';
    const payload = editUser ? { ...form, password: form.password || undefined } : form;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { toast.error(data?.error ?? 'B\u0142\u0105d'); return; }
    toast.success(editUser ? 'Zaktualizowano' : 'Dodano u\u017cytkownika');
    setDialogOpen(false); fetchUsers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Usun\u0105\u0107 u\u017cytkownika?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    toast.success('Usuni\u0119to'); fetchUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">U\u017cytkownicy</h1>
          <p className="text-muted-foreground">Zarz\u0105dzanie u\u017cytkownikami systemu (maks. 10)</p>
        </div>
        {isAdmin && <Button onClick={openNew} disabled={(users?.length ?? 0) >= 10}><Plus className="w-4 h-4 mr-1" /> Dodaj</Button>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editUser ? 'Edytuj' : 'Nowy u\u017cytkownik'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Imi\u0119 i nazwisko *</Label><Input value={form.name} onChange={(e: any) => setForm(p => ({...(p ?? {}), name: e?.target?.value ?? ''}))} /></div>
            <div className="space-y-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={(e: any) => setForm(p => ({...(p ?? {}), email: e?.target?.value ?? ''}))} /></div>
            <div className="space-y-2"><Label>{editUser ? 'Nowe has\u0142o (puste = bez zmian)' : 'Has\u0142o *'}</Label><Input type="password" value={form.password} onChange={(e: any) => setForm(p => ({...(p ?? {}), password: e?.target?.value ?? ''}))} /></div>
            <div className="space-y-2">
              <Label>Rola</Label>
              <Select value={form.role} onValueChange={(v: string) => setForm(p => ({...(p ?? {}), role: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="USER">U\u017cytkownik</SelectItem><SelectItem value="ADMIN">Administrator</SelectItem></SelectContent>
              </Select>
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
            <TableHeader><TableRow>
              <TableHead>Imi\u0119 i nazwisko</TableHead><TableHead>Email</TableHead><TableHead>Rola</TableHead><TableHead>Data utworzenia</TableHead>
              {isAdmin && <TableHead className="text-right">Akcje</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Wczytywanie...</TableCell></TableRow> :
              (users?.length ?? 0) === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Brak u\u017cytkownik\u00f3w</TableCell></TableRow> :
              users?.map?.((u: any) => (
                <TableRow key={u?.id}>
                  <TableCell className="font-medium">{u?.name}</TableCell>
                  <TableCell>{u?.email}</TableCell>
                  <TableCell><Badge variant={u?.role === 'ADMIN' ? 'default' : 'secondary'}>{u?.role === 'ADMIN' ? 'Admin' : 'U\u017cytkownik'}</Badge></TableCell>
                  <TableCell className="text-sm">{u?.createdAt ? new Date(u.createdAt).toLocaleDateString('pl-PL') : '-'}</TableCell>
                  {isAdmin && <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(u?.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>}
                </TableRow>
              )) ?? []}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
