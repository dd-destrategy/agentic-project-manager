import { withAuth } from 'next-auth/middleware';

/**
 * Next.js Middleware for authentication
 *
 * Protects dashboard routes and API endpoints globally.
 * Unauthenticated users are redirected to /auth/signin.
 */
export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    // Protect all dashboard routes
    '/(dashboard)/:path*',
    // Protect API routes (except auth endpoints)
    '/api/((?!auth).*)/:path*',
  ],
};
