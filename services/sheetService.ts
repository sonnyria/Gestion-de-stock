import { ApiResponse, InventoryItem } from '../types';

// Clé de stockage locale
export const STORAGE_KEY_URL = 'GOOGLE_SCRIPT_URL';

export const getScriptUrl = () => {
  // On ne regarde que le localStorage. Si vide, l'utilisateur doit configurer.
  return localStorage.getItem(STORAGE_KEY_URL) || "";
};

// Fonction générique pour les appels POST JSON
const postJson = async (body: Record<string, any>): Promise<any> => {
  const url = getScriptUrl();
  if (!url) return { status: 'error', message: 'URL non configurée' };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.items && body.action !== 'read') {
       throw new Error("Version obsolète");
    }
    
    return data;
  } catch (err) {
    console.error("API Call Error:", err);
    throw err;
  }
};

export const fetchInventory = async (): Promise<InventoryItem[]> => {
  const url = getScriptUrl();
  if (!url) {
    throw new Error("Veuillez configurer l'URL du script dans les paramètres (icône engrenage).");
  }

  try {
    const noCacheUrl = `${url}?action=read&t=${Date.now()}`;
    const response = await fetch(noCacheUrl);
    const data: ApiResponse = await response.json();
    
    if (data.status === 'success' && data.items) {
      return data.items;
    } else {
      throw new Error(data.message || "Erreur lors de la récupération des données");
    }
  } catch (error) {
    console.error("Fetch error details:", error);
    throw error;
  }
};

export const updateStock = async (itemName: string, newStock: number): Promise<boolean> => {
  try {
    const data = await postJson({
      action: 'update',
      name: itemName,
      stock: newStock
    });
    return data.status === 'success';
  } catch (e) { return false; }
};

export const updateThreshold = async (itemName: string, newThreshold: number): Promise<boolean> => {
  try {
    const data = await postJson({
      action: 'updateThreshold',
      name: itemName,
      threshold: newThreshold
    });
    if (data.status === 'error' && data.message?.includes("Seuil")) {
       alert(data.message);
    }
    return data.status === 'success';
  } catch (e) { return false; }
};

export const updateItemDetails = async (itemName: string, updates: Record<string, any>): Promise<boolean> => {
  try {
    const data = await postJson({
      action: 'updateDetails',
      name: itemName,
      updates: updates
    });
    return data.status === 'success';
  } catch (e) { return false; }
};

export const addArticle = async (name: string, stock: number, threshold: number, details: Record<string, any> = {}): Promise<boolean> => {
  try {
    const data = await postJson({
      action: 'add',
      name: name,
      stock: stock,
      threshold: threshold,
      details: details
    });
    return data.status === 'success';
  } catch (e) { return false; }
};

export const deleteArticle = async (name: string): Promise<boolean> => {
  try {
    const data = await postJson({
      action: 'delete',
      name: name
    });
    if (data.status === 'error') {
        throw new Error(data.message);
    }
    return data.status === 'success';
  } catch (e: any) { 
      // On propage l'erreur pour l'afficher dans l'UI
      throw e; 
  }
};