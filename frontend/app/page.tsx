'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? (user.role === 'SUPERADMIN' ? '/superadmin' : '/overview') : '/login');
  }, [user, loading, router]);
  return null;
}
