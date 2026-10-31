export type ProfileSection = 'account' | 'organization' | 'billing' | 'payments' | 'messages';

// Owner-only sections other than `account` live under /admin/profile/<slug>.
export const profileSections: { id: ProfileSection; label: string; href: string; description: string; ownerOnly: boolean }[] = [
  { id: 'account', label: 'My account', href: '/admin/profile', description: 'Your login details and password.', ownerOnly: false },
  { id: 'organization', label: 'Organization', href: '/admin/profile/organization', description: 'Business details, outlets and account deletion.', ownerOnly: true },
  { id: 'billing', label: 'Billing', href: '/admin/profile/billing', description: 'Your plan, fees and renewal date.', ownerOnly: true },
  { id: 'payments', label: 'Payment methods', href: '/admin/profile/payments', description: 'What customers can pay with, and where each appears.', ownerOnly: true },
  { id: 'messages', label: 'Customer messages', href: '/admin/profile/messages', description: 'Wording shared with customers when an order changes status.', ownerOnly: true },
];
