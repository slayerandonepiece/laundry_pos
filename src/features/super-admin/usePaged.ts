'use client';
import { useState } from 'react';

/**
 * Client-side paging for lists already in memory. `resetKey` should change whenever the filters change so the
 * list returns to page 1; no effect is needed because a stale page is simply ignored.
 */
export function usePaged<T>(items: T[], resetKey: string, initialSize = 10) {
  const [state, setState] = useState({ page: 1, size: initialSize, key: resetKey });
  const size = state.size;
  const pages = Math.max(Math.ceil(items.length / size), 1);
  const page = Math.min(state.key === resetKey ? state.page : 1, pages);
  return {
    page, size, total: items.length,
    rows: items.slice((page - 1) * size, page * size),
    setPage: (next: number) => setState({ page: next, size, key: resetKey }),
    setSize: (next: number) => setState({ page: 1, size: next, key: resetKey }),
  };
}
