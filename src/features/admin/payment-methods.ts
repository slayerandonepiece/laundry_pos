import type { StorePaymentMethod } from './admin.types';

export function isCashOnDelivery(method?: Pick<StorePaymentMethod, 'name' | 'code'>): boolean {
  const value = (method?.code || method?.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return value === 'COD' || value === 'CASHONDELIVERY';
}
