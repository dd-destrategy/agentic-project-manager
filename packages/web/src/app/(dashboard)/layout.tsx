import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { ErrorBoundary } from '@/components/error-boundary';
import { ResponsiveLayout } from '@/components/responsive-layout';

import { authOptions } from '../api/auth/[...nextauth]/auth-options';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <ResponsiveLayout>
      <ErrorBoundary>{children}</ErrorBoundary>
    </ResponsiveLayout>
  );
}
