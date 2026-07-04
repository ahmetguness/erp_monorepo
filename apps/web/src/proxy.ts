import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes — no auth required
const PUBLIC_PATHS = ['/', '/login', '/register', '/admin/login', '/set-password', '/invite', '/api-docs'];

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Admin paths use their own auth (admin-token cookie) — don't interfere
  const isAdminPath = pathname.startsWith('/admin');

  // Allow public paths and static assets
  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.');

  // Admin routes: only /admin/login is public, rest handled by admin panel layout
  if (isAdminPath) {
    return NextResponse.next();
  }

  // Read token from cookie (set on login) or skip
  const token = request.cookies.get('axon_token')?.value;

  // Unauthenticated → redirect to login
  if (!isPublic && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated → redirect away from auth pages
  if (token && (pathname === '/login' || pathname === '/register')) {
    const from = request.nextUrl.searchParams.get('from');
    const target = from && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png).*)',
  ],
};
