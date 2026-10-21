'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Loading } from '@/components/ui';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);
  if (loading || !user) return <Loading label="Loading your workspace" />;
  return <Shell>{children}</Shell>;
}
