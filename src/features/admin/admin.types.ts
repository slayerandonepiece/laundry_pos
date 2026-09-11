export type Screen = 'login' | 'dashboard' | 'products' | 'sales' | 'expenses' | 'profile' | 'employees' | 'orders';
export type Role = 'owner' | 'employee';
export interface Employee { id: string; name: string; username: string; active: boolean; credentialVersion: number }
// Client-side mirror of the server-verified session (see loginAction), used
// only for routing/display; every Server Action/Component re-checks the real
// HttpOnly session independently.
export interface Session { id: string; role: Role; name: string }
export interface AdminUser { id: string; name: string; role: Role }
export type WorkStatus = 'Pending' | 'In Progress' | 'Ready' | 'Delivered';
export type Product = { id: string; name: string; category: string; active: boolean } & ({ type: 'item'; price: number } | { type: 'weight'; slabs: { limit: number; price: number }[]; extra: number });
export interface Line { productId: string; name: string; quantity: number; unit: string; amount: number }
export type PaymentMethod = string;
export interface StorePaymentMethod { id: string; name: string; active: boolean }
export interface Payment { id: string; amount: number; date: string; method: PaymentMethod }
export interface StatusEvent { status: WorkStatus; at: string; by: string }
export interface Order { history?: StatusEvent[]; id: string; name: string; phone: string; date: string; due: string; completed?: string; legacyCancelled?: boolean; status: WorkStatus; lines: Line[]; payments: Payment[]; notes: string }
export interface Expense { id: string; title: string; category: string; amount: number; due: string; paid?: string; monthly: boolean; seriesId?: string }
export interface Profile { name: string; phone: string; email: string; store: string; address: string }
export interface DateRange { from: string; to: string }
