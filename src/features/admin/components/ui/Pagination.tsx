'use client';

import React from 'react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Windowed pagination algorithm: e.g. 1 2 3 ... 13 14
  const getPages = (): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const pages = getPages();

  return (
    <nav className={`pagination ${className}`.trim()} aria-label="Pagination Navigation">
      <button
        type="button"
        className="page-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="Previous page"
      >
        ‹
      </button>

      {pages.map((item, idx) => {
        if (item === '...') {
          return (
            <span
              key={`ellipsis-${idx}`}
              style={{ padding: '0 4px', color: 'var(--muted)', fontSize: '13px' }}
            >
              …
            </span>
          );
        }

        const pageNum = item as number;
        const isActive = pageNum === currentPage;

        return (
          <button
            key={pageNum}
            type="button"
            className={`page-btn ${isActive ? 'active' : ''}`.trim()}
            onClick={() => onPageChange(pageNum)}
            aria-current={isActive ? 'page' : undefined}
          >
            {pageNum}
          </button>
        );
      })}

      <button
        type="button"
        className="page-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

export default Pagination;
