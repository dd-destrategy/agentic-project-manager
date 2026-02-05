import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * NextAuth configuration
 *
 * Single-user authentication using Credentials provider.
 * Password is stored in NEXTAUTH_PASSWORD environment variable.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
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

        if (credentials?.password === storedPassword) {
          // Return a single user object
          return {
            id: '1',
            name: 'PM User',
            email: 'pm@localhost',
          };
        }

        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
};
