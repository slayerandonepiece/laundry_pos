'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from './Dialog';
import Icon from './Icon';
import OnboardingWizard from './OnboardingWizard';
import type { SubscriptionPlanListItem } from '../types';

export default function OnboardStoreAction({ plans, variant = 'default' }: { plans: SubscriptionPlanListItem[]; variant?: 'default' | 'block' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return <>
    <button type="button" className={variant === 'block' ? 'btn outline block' : 'btn'} style={variant === 'block' ? { justifyContent: 'flex-start' } : undefined} onClick={() => setOpen(true)}><Icon name="plus" size="s" />Onboard organization</button>
    {open && (
      <Dialog title="Onboard organization" description="Create the organization, owner access, and subscription." size="wide" onClose={() => setOpen(false)} warnOnChanges>
        <OnboardingWizard plans={plans.filter(p => !p.archivedAt)} onSaved={() => router.refresh()} />
      </Dialog>
    )}
  </>;
}
