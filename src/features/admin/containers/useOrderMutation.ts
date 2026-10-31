'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Order } from '../admin.types';
import { cacheCreatedOrder } from '../client-cache';

type ActionResult = Order | { ok: false; error: string };

/** Keep the dialog blocked until both the action and route refresh settle. */
export function useOrderMutation({ storeId, serverOrders, onError, onSuccess }: {
  storeId: string; serverOrders?: Order[]; onError: (message: string) => void; onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const [label, setLabel] = useState('Saving changes…');
  const [updatedOrder, setUpdatedOrder] = useState<Order | null>(null);
  useEffect(() => {
    // A refreshed server snapshot takes over from the acknowledged action result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpdatedOrder(null);
  }, [serverOrders]);
  function run(action: () => Promise<ActionResult>, loadingLabel: string, success: string, failure: string) {
    if (pending || inFlight.current) return;
    inFlight.current = true;
    setLabel(loadingLabel);
    onError('');
    startTransition(async () => {
      try {
        const result = await action();
        // A failure the server explained (e.g. a balance is still due) is shown as written.
        if ('ok' in result) { onError(result.error); return; }
        const order = result;
        cacheCreatedOrder(storeId, order);
        // Updates after an async boundary need their own transition in React 19.
        startTransition(() => { setUpdatedOrder(order); router.refresh(); });
        onSuccess(success);
      } catch { onError(failure); }
      finally { inFlight.current = false; }
    });
  }
  return { pending, label, updatedOrder, run };
}
