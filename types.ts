export interface Product {
  barcode: string;
  name: string;
  quantity: number;
  category?: string;
  emoji?: string;
  lastUpdated: number; // Timestamp
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  SCANNER = 'SCANNER',
  ADD_PRODUCT = 'ADD_PRODUCT',
  PRODUCT_DETAILS = 'PRODUCT_DETAILS'
}

export interface ScanResult {
  barcode: string | null;
  error?: string;
}

export interface ProductEnhancement {
  category: string;
  emoji: string;
  suggestedName?: string;
}