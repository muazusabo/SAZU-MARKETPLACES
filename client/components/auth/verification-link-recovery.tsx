'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function VerificationLinkRecovery() {
  const router = useRouter();

  useEffect(() => {
    const fragment = window.location.hash;
    if (!fragment) return;

    const params = new URLSearchParams(fragment.slice(1));
    if (params.get('error_code') !== 'otp_expired') return;

    router.replace('/verify-email?reason=expired');
  }, [router]);

  return null;
}
