import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/auth-page';

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/dashboard');
  return <AuthPage />;
}
