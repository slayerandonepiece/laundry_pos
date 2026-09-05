export interface CartEntry { productId: string; quantity: number }
export interface SaleDraft { customerReady?: boolean; entries: CartEntry[]; phone: string; name: string; due: string; notes: string; received: string; method: string }
