import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/sonner';
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler';

const dmSans = DM_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-sans' });
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return {
    title: 'Ewidencja Przebiegu Pojazdów',
    description: 'System ewidencji przebiegu pojazdów zgodny z polskim prawem podatkowym',
    icons: {
      icon: '/favicon.svg',
      shortcut: '/favicon.svg',
    },
    metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
    openGraph: {
      title: 'Ewidencja Przebiegu Pojazdów',
      description: 'System ewidencji przebiegu pojazdów zgodny z polskim prawem podatkowym',
      images: ['/og-image.png'],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
      </head>
      <body className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        <Providers>
          {children}
          <Toaster />
          <ChunkLoadErrorHandler />
        </Providers>
      </body>
    </html>
  );
}
