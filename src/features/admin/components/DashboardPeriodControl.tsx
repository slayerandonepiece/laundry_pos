'use client';
import DateInput from './DateInput';

import React, { useState, useRef, useEffect } from 'react';
import type { DateRange } from '../admin.types';
import { rangeFor } from '../admin.data';

const PERIOD_LABELS: Record<string, string> = { '14d': 'Last 14 days', week: 'This week', month: 'This month', quarter: 'This quarter', custom: 'Custom dates' };

export interface DashboardPeriodControlProps {
  period: string;
  range: DateRange;
  currentDate: string;
  onPeriodChange: (period: string) => void;
  onRangeChange: (range: DateRange) => void;
}

export default function DashboardPeriodControl({
  period,
  range,
  currentDate,
  onPeriodChange,
  onRangeChange,
}: DashboardPeriodControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const displayLabel = PERIOD_LABELS[period] ?? 'Custom dates';

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="pill"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <span>{displayLabel}</span>
        <span style={{ fontSize: '10px' }}>▾</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter reporting period"
          className="dashboard-range-menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            padding: '16px',
            width: '320px',
            maxWidth: 'calc(100vw - 48px)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: '#fff',
            boxShadow: '0 8px 24px rgba(16, 32, 57, 0.14)',
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="dashboard-period-select" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>
              Preset
            </label>
            <select
              id="dashboard-period-select"
              value={period}
              onChange={e => {
                const val = e.target.value;
                if (val === '14d') {
                  onPeriodChange('14d');
                  onRangeChange({
                    from: new Date(Date.parse(currentDate) - 13 * 86400000).toISOString().slice(0, 10),
                    to: currentDate,
                  });
                  setOpen(false);
                } else if (val === 'custom') {
                  onPeriodChange('custom');
                } else {
                  onPeriodChange(val);
                  onRangeChange(rangeFor(val));
                  setOpen(false);
                }
              }}
              style={{ minHeight: '40px', fontSize: '13px', borderRadius: '8px' }}
            >
              <option value="14d">Last 14 days</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="custom">Custom dates</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '130px' }}>
                <label htmlFor="dashboard-from-date" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                  From
                </label>
                <DateInput
                  id="dashboard-from-date"
                  type="date"
                  value={range.from}
                  max={range.to}
                  onChange={e => {
                    if (e.target.value && e.target.value <= range.to) {
                      onPeriodChange('custom');
                      onRangeChange({ ...range, from: e.target.value });
                    }
                  }}
                  style={{ width: '100%', minWidth: '145px', minHeight: '40px', fontSize: '13px', padding: '6px 10px', borderRadius: '8px' }}
                />
              </div>
              <div style={{ flex: 1, minWidth: '130px' }}>
                <label htmlFor="dashboard-to-date" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                  To
                </label>
                <DateInput
                  id="dashboard-to-date"
                  type="date"
                  value={range.to}
                  min={range.from}
                  onChange={e => {
                    if (e.target.value && e.target.value >= range.from) {
                      onPeriodChange('custom');
                      onRangeChange({ ...range, to: e.target.value });
                    }
                  }}
                  style={{ width: '100%', minWidth: '145px', minHeight: '40px', fontSize: '13px', padding: '6px 10px', borderRadius: '8px' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setOpen(false)}
              style={{ minHeight: '36px', padding: '6px 12px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
