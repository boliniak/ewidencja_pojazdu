import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        if (pathname === '/' || pathname.startsWith('/api/auth') || pathname.startsWith('/api/signup')) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/ewidencja/:path*',
    '/pojazdy/:path*',
    '/uzytkownicy/:path*',
    '/ksef/:path*',
    '/wyciagi/:path*',
    '/weryfikacja/:path*',
    '/raporty/:path*',
    '/ustawienia/:path*',
    '/api/vehicles/:path*',
    '/api/entries/:path*',
    '/api/users/:path*',
    '/api/ksef/:path*',
    '/api/bank/:path*',
    '/api/fuel/:path*',
    '/api/settings/:path*',
    '/api/backup/:path*',
    '/api/reports/:path*',
  ],
};
