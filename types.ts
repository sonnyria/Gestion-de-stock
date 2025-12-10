export interface InventoryItem {
  name: string;
  stock: number;
  threshold: number; // Nouveau champ pour l'alarme
  details?: Record<string, any>; // Détails complets de la ligne
}

export interface ApiResponse {
  status: 'success' | 'error';
  items?: InventoryItem[];
  message?: string;
  hasThresholdColumn?: boolean;
}