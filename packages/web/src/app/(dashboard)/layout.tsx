import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

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

  return <ResponsiveLayout>{children}</ResponsiveLayout>;
}
