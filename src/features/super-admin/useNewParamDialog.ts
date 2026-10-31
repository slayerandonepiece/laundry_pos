'use client';
import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Dialog open state for a page's "create" button that can also be opened by a `?new=<token>` link
 * (the command palette uses it). Closing drops the param, and each fresh token opens the dialog once.
 */
export function useNewParamDialog(): [boolean, (open: boolean) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const token = params.get('new');
  const [manual, setManual] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const open = manual || (token !== null && token !== dismissed);
  const set = (next: boolean) => {
    if (next) { setManual(true); return; }
    setManual(false);
    setDismissed(token);
    if (token !== null) router.replace(pathname);
  };
  return [open, set];
}
