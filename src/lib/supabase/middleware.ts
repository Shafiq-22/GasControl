import { getSupabaseConfig } from './config';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Public routes. Everything else needs a session. */
const PUBLIC = ['/login', '/auth'];

export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) {
    if (request.nextUrl.pathname === '/setup') return NextResponse.next();
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Database connection is not configured.' }, { status: 503 });
    const url = request.nextUrl.clone(); url.pathname = '/setup'; url.search = '';
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    config.url,
    config.key,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: { name: string; value: string; options?: CookieOptions }[]) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser revalidates against the auth server; do not replace it with
  // getSession, which trusts the cookie.
  const { data } = await supabase.auth.getUser();
  const isPublic = PUBLIC.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }

  if (data.user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
