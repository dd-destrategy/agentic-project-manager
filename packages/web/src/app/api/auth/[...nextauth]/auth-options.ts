import { timingSafeEqual } from 'crypto';

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * NextAuth configuration
 *
 * Single-user authentication using Credentials provider.
 * Environment variables required:
 * - NEXTAUTH_SECRET: Secret for JWT signing (required)
 * - NEXTAUTH_PASSWORD: User password for authentication (required)
 * - NEXTAUTH_URL: Canonical URL of the site (required in production)
 */

// Validate required environment variables at startup
function validateEnvVars() {
  const missing: string[] = [];

  if (!process.env.NEXTAUTH_SECRET) {
    missing.push('NEXTAUTH_SECRET');
  }
  if (!process.env.NEXTAUTH_PASSWORD) {
    missing.push('NEXTAUTH_PASSWORD');
  }

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

validateEnvVars();

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Password',
      credentials: {
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const storedPassword = process.env.NEXTAUTH_PASSWORD;

        if (!storedPassword) {
          console.error('NEXTAUTH_PASSWORD environment variable not set');
          return null;
        }

        // Constant-time comparison to prevent timing attacks
        if (credentials?.password) {
          const inputBuffer = Buffer.from(credentials.password);
          const storedBuffer = Buffer.from(storedPassword);

          // Ensure same length for timingSafeEqual, then compare
          if (
            inputBuffer.length === storedBuffer.length &&
            timingSafeEqual(inputBuffer, storedBuffer)
          ) {
            // Return a single user object for personal use
            return {
              id: 'pm-user-1',
              name: 'PM User',
              email: 'pm@localhost',
            };
          }
        }

        return null;
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin', // Redirect errors to signin page
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string; name: string }).id = token.id as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};
