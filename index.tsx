
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import Webcam from 'react-webcam';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";

// ==========================================
// 1. TYPES & INTERFACES
// ==========================================

export interface Product {
  barcode: string;
  name: string;
  quantity: number;
  category?: string;
  emoji?: string;
  lastUpdated: number;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  SCANNER = 'SCANNER',
  ADD_PRODUCT = 'ADD_PRODUCT',
  PRODUCT_DETAILS = 'PRODUCT_DETAILS'
}

export interface ProductEnhancement {
  category: string;
  emoji: string;
  suggestedName?: string;
}

// ==========================================
// 2. SERVICES (GEMINI)
// ==========================================

const getAIClient = (): GoogleGenAI => {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    throw new Error("Clé API manquante. Veuillez la configurer dans les paramètres.");
  }
  return new GoogleGenAI({ apiKey });
};

const readBarcodeWithGemini = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: "Analyze this image to find a product barcode (UPC, EAN, ISBN). 1. Look for the black bars. 2. If the bars are blurry, READ THE NUMBERS printed below the bars. Return ONLY the sequence of digits/characters found. Remove any spaces. If nothing is found, return 'NOT_FOUND'." }
        ]
      },
      config: { temperature: 0.1 }
    });

    const text = response.text?.trim();
    if (!text || text === 'NOT_FOUND') return null;

    const match = text.replace(/\s/g, '').match(/[0-9A-Za-z]{8,}/);
    if (match && match[0]) return match[0];
    if (/^\d+$/.test(text)) return text;
    
    return null;
  } catch (error: any) {
    console.error("Gemini Scan Error:", error);
    if (error.message?.includes("Clé API") || error.message?.includes("API key")) {
        throw error;
    }
    return null;
  }
};

const enhanceProductInfo = async (productName: string): Promise<ProductEnhancement> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Categorize the product named "${productName}" and provide a suitable emoji.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            emoji: { type: Type.STRING },
            suggestedName: { type: Type.STRING }
          },
          required: ["category", "emoji"],
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response");
    return JSON.parse(jsonText) as ProductEnhancement;
  } catch (error) {
    console.error("Gemini Enhancement Error:", error);
    return { category: "Divers", emoji: "📦", suggestedName: productName };
  }
};

// ==========================================
// 3. COMPONENT: SCANNER
// ==========================================

interface ScannerProps {
  onScan: (barcode: string) => void;
  onCancel: () => void;
}

const Scanner: React.FC<ScannerProps> = ({ onScan, onCancel }) => {
  const webcamRef = useRef<Webcam>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(() => {
      return localStorage.getItem('scanner_device_id') || undefined;
  });

  const handleDevices = useCallback(async () => {
    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(mediaDevices.filter(({ kind }) => kind === "videoinput"));
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { handleDevices(); }, [handleDevices]);

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    if (deviceId) {
      setSelectedDeviceId(deviceId);
      localStorage.setItem('scanner_device_id', deviceId);
    } else {
      setSelectedDeviceId(undefined);
      localStorage.removeItem('scanner_device_id');
    }
    setTorchOn(false);
    setTorchSupported(false);
  };

  const handleUserMedia = (stream: MediaStream) => {
      handleDevices();
      const track = stream.getVideoTracks()[0];
      if (track) {
          const capabilities = (track as any).getCapabilities();
          setTorchSupported(!!capabilities.torch);
      }
  };

  const toggleTorch = async () => {
      if (!webcamRef.current || !torchSupported) return;
      const stream = webcamRef.current.video?.srcObject as MediaStream;
      const track = stream?.getVideoTracks()[0];
      if (track) {
          try {
              await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
              setTorchOn(!torchOn);
          } catch (err) { console.error(err); }
      }
  };

  const captureAndScan = useCallback(async () => {
    if (!webcamRef.current || scanning) return;
    const imageSrc = webcamRef.current.getScreenshot({width: 1920, height: 1080});
    if (!imageSrc) return;

    setScanning(true);
    try {
      const barcode = await readBarcodeWithGemini(imageSrc);
      if (barcode) onScan(barcode);
    } catch (e) { console.error(e); } 
    finally { setScanning(false); }
  }, [webcamRef, scanning, onScan]);

  useEffect(() => {
    const intervalId = setInterval(() => {
        if (!scanning && !error) captureAndScan();
    }, 1500);
    return () => clearInterval(intervalId);
  }, [scanning, error, captureAndScan]);

  const videoConstraints = {
    width: { min: 1280, ideal: 1920 },
    height: { min: 720, ideal: 1080 },
    deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
    facingMode: selectedDeviceId ? undefined : "environment"
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden bg-black">
        <div className="absolute top-0 left-0 right-0 z-30 flex justify-between items-start px-4 pt-safe mt-4">
            <div className="flex-1 flex justify-center mr-10">
                <select
                className="bg-black/60 text-white border border-gray-500 rounded-full px-4 py-2 text-sm backdrop-blur-sm max-w-full outline-none appearance-none truncate shadow-lg"
                value={selectedDeviceId || ""}
                onChange={handleCameraChange}
                >
                <option value="">Caméra automatique</option>
                {devices.map((device, key) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label || `Caméra ${key + 1}`}</option>
                ))}
                </select>
            </div>
            {torchSupported && (
                <button onClick={toggleTorch} className={`absolute right-4 w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm border transition-all ${torchOn ? 'bg-yellow-500/80 border-yellow-400 text-white' : 'bg-black/60 border-gray-500 text-gray-300'}`}>
                    <span className="text-lg">⚡</span>
                </button>
            )}
        </div>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          screenshotQuality={1}
          forceScreenshotSourceSize={true}
          videoConstraints={videoConstraints}
          onUserMedia={handleUserMedia} 
          onUserMediaError={() => setError("Erreur caméra")}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 border-[40px] border-black/50 flex items-center justify-center pointer-events-none">
          <div className={`w-72 h-48 border-2 rounded-lg relative transition-colors duration-300 ${scanning ? 'border-blue-500 bg-blue-500/10' : 'border-white/50'}`}>
             <div className="absolute inset-x-0 -bottom-10 text-center">
                <p className="text-white text-sm font-bold bg-black/60 px-3 py-1 rounded-full inline-block shadow-lg backdrop-blur-md">
                  {scanning ? 'Analyse en cours...' : 'Recherche automatique...'}
                </p>
             </div>
          </div>
        </div>
        {error && <div className="absolute top-24 left-4 right-4 bg-red-600/90 text-white p-4 rounded-xl text-center z-20">{error}</div>}
      </div>
      <div className="h-24 bg-gray-900 flex items-center justify-center px-8 pb-safe border-t border-gray-800 relative">
        <button onClick={onCancel} className="absolute left-8 text-gray-400 hover:text-white font-medium py-3 px-6 rounded-full border border-gray-600 hover:bg-gray-800 transition">Annuler</button>
        <div className="text-xs text-blue-400 font-mono animate-pulse">AUTO-SCAN ACTIF</div>
      </div>
    </div>
  );
};

// ==========================================
// 4. COMPONENT: PRODUCT FORM
// ==========================================

interface ProductFormProps {
  barcode: string;
  onSave: (product: Product) => void;
  onCancel: () => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ barcode, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('Divers');
  const [emoji, setEmoji] = useState('📦');
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  const handleAIEnhance = async () => {
    if (name.length < 3) return;
    setIsLoadingAI(true);
    try {
      const info = await enhanceProductInfo(name);
      setCategory(info.category);
      setEmoji(info.emoji);
      if (info.suggestedName) setName(info.suggestedName);
    } catch (e) { console.error(e); } 
    finally { setIsLoadingAI(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ barcode, name, quantity, category, emoji, lastUpdated: Date.now() });
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><span className="bg-green-600 rounded p-1 text-lg">🆕</span> Nouveau Produit</h2>
      <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700">
        <p className="text-gray-400 text-sm uppercase tracking-wider mb-1">Code-barres</p>
        <p className="text-2xl font-mono text-blue-400 tracking-widest">{barcode}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Nom</label>
          <div className="flex gap-2">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Nutella 500g" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
            <button type="button" onClick={handleAIEnhance} disabled={isLoadingAI || name.length < 3} className="bg-purple-600 text-white p-3 rounded-lg disabled:opacity-50">
              {isLoadingAI ? '...' : '✨ IA'}
            </button>
          </div>
        </div>
        <div className="flex gap-4">
             <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1">Icône</label>
              <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-center text-xl" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1">Stock</label>
              <div className="flex items-center justify-between bg-gray-800 rounded-lg border border-gray-700 p-1 w-full h-[52px]">
                <button type="button" onClick={() => setQuantity(Math.max(0, quantity - 1))} className="w-10 h-full flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded">-</button>
                <input type="number" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 0)} className="w-12 text-center bg-transparent font-bold outline-none" />
                 <button type="button" onClick={() => setQuantity(quantity + 1)} className="w-10 h-full flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded">+</button>
              </div>
            </div>
        </div>
        <div className="flex-1"></div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onCancel} className="flex-1 bg-gray-800 text-white py-3 px-4 rounded-lg">Annuler</button>
          <button type="submit" disabled={!name} className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-bold disabled:opacity-50">Enregistrer</button>
        </div>
      </form>
    </div>
  );
};

// ==========================================
// 5. COMPONENT: STOCK CONTROL
// ==========================================

interface StockControlProps {
  product: Product;
  onUpdateStock: (barcode: string, delta: number) => void;
  onClose: () => void;
  onDelete: (barcode: string) => void;
}

const StockControl: React.FC<StockControlProps> = ({ product, onUpdateStock, onClose, onDelete }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  
  const handleDeleteClick = () => {
    if (isConfirming) {
      onDelete(product.barcode);
    } else {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6">
      <button onClick={onClose} className="mb-6 text-gray-400 flex items-center gap-2">← Retour</button>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{product.emoji || '📦'}</span>
            <h2 className="text-3xl font-bold leading-tight">{product.name}</h2>
          </div>
        </div>
        <div className="text-right">
           <p className="text-xs text-gray-500 font-mono">REF</p>
           <p className="text-sm font-mono text-blue-400">{product.barcode}</p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center flex-1 bg-gray-800/50 rounded-2xl p-8 border border-gray-800">
        <p className="text-gray-400 text-sm uppercase tracking-widest mb-4">En Stock</p>
        <div className="text-8xl font-bold text-white mb-8 tabular-nums">{product.quantity}</div>
        <div className="flex items-center gap-6 w-full max-w-xs">
          <button onClick={() => onUpdateStock(product.barcode, -1)} className="flex-1 h-20 rounded-xl bg-red-900/20 border border-red-900/50 text-red-500 text-4xl flex items-center justify-center">-</button>
          <button onClick={() => onUpdateStock(product.barcode, 1)} className="flex-1 h-20 rounded-xl bg-green-900/20 border border-green-900/50 text-green-500 text-4xl flex items-center justify-center">+</button>
        </div>
      </div>
      <div className="mt-auto pt-8">
        <button onClick={handleDeleteClick} className={`w-full py-4 rounded-xl text-base font-semibold flex items-center justify-center gap-2 ${isConfirming ? 'bg-red-600 text-white' : 'bg-red-900/10 text-red-400'}`}>
          {isConfirming ? '⚠️ Confirmer ?' : 'Supprimer'}
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 6. MAIN APP COMPONENT
// ==========================================

const App: React.FC = () => {
  const [inventory, setInventory] = useState<Product[]>([]);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(3);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [pendingImport, setPendingImport] = useState<{ inventory: Product[], settings?: { threshold: number } } | null>(null);
  const [showIosInstallPrompt, setShowIosInstallPrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedInventory = localStorage.getItem('stock_inventory');
    if (savedInventory) {
      try { setInventory(JSON.parse(savedInventory)); } catch (e) {}
    }
    const savedSettings = localStorage.getItem('stock_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.threshold === 'number') setLowStockThreshold(parsed.threshold);
      } catch (e) {}
    }
    const savedApiKey = localStorage.getItem('gemini_api_key');
    if (savedApiKey) setApiKey(savedApiKey);

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isStandalone) setTimeout(() => setShowIosInstallPrompt(true), 2000);
  }, []);

  useEffect(() => { localStorage.setItem('stock_inventory', JSON.stringify(inventory)); }, [inventory]);
  useEffect(() => { localStorage.setItem('stock_settings', JSON.stringify({ threshold: lowStockThreshold })); }, [lowStockThreshold]);

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  const handleExportData = () => {
    const data = { timestamp: new Date().toISOString(), inventory, settings: { threshold: lowStockThreshold } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.inventory && Array.isArray(data.inventory)) setPendingImport(data);
        else alert("Fichier invalide.");
      } catch (err) { alert("Erreur lecture JSON."); }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const confirmRestore = () => {
    if (pendingImport) {
      setInventory(pendingImport.inventory);
      if (pendingImport.settings?.threshold !== undefined) setLowStockThreshold(pendingImport.settings.threshold);
      setPendingImport(null);
      setShowSettings(false);
    }
  };

  const handleScan = (barcode: string) => {
    setActiveBarcode(barcode);
    const exists = inventory.find(p => p.barcode === barcode);
    setView(exists ? ViewState.PRODUCT_DETAILS : ViewState.ADD_PRODUCT);
  };

  const handleAddProduct = (newProduct: Product) => {
    setInventory(prev => [...prev, newProduct]);
    setView(ViewState.DASHBOARD);
    setActiveBarcode(null);
  };

  const handleUpdateStock = (barcode: string, delta: number) => {
    setInventory(prev => prev.map(p => p.barcode === barcode ? { ...p, quantity: Math.max(0, p.quantity + delta), lastUpdated: Date.now() } : p));
  };

  const handleUpdateName = (barcode: string, newName: string) => {
    setInventory(prev => prev.map(p => p.barcode === barcode ? { ...p, name: newName, lastUpdated: Date.now() } : p));
  };

  const handleDeleteProduct = (barcode: string) => {
    setInventory(prev => prev.filter(p => p.barcode !== barcode));
    setView(ViewState.DASHBOARD);
    setActiveBarcode(null);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcodeInput.trim()) {
      handleScan(manualBarcodeInput.trim());
      setManualBarcodeInput('');
    }
  };

  const totalItems = inventory.reduce((acc, curr) => acc + curr.quantity, 0);
  const lowStockItemsCount = inventory.filter(i => i.quantity <= lowStockThreshold).length;
  const chartData = [...inventory].sort((a, b) => b.quantity - a.quantity).slice(0, 5).map(p => ({ name: p.name.substring(0,10), value: p.quantity }));

  if (view === ViewState.SCANNER) return <Scanner onScan={handleScan} onCancel={() => setView(ViewState.DASHBOARD)} />;
  if (view === ViewState.ADD_PRODUCT && activeBarcode) return <div className="pt-safe h-full bg-gray-900"><ProductForm barcode={activeBarcode} onSave={handleAddProduct} onCancel={() => setView(ViewState.DASHBOARD)} /></div>;
  if (view === ViewState.PRODUCT_DETAILS && activeBarcode) {
    const product = inventory.find(p => p.barcode === activeBarcode);
    if (product) return <div className="pt-safe h-full bg-gray-900"><StockControl product={product} onUpdateStock={handleUpdateStock} onDelete={handleDeleteProduct} onClose={() => setView(ViewState.DASHBOARD)} /></div>;
    setView(ViewState.DASHBOARD); return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col relative pt-safe">
      {showIosInstallPrompt && (
        <div className="fixed top-0 left-0 right-0 z-[100] pt-safe animate-fade-in pointer-events-none">
           <div className="p-4 pointer-events-auto">
                <div className="bg-blue-600/95 text-white p-4 rounded-xl shadow-2xl border border-blue-400 relative backdrop-blur-sm">
                    <button onClick={() => setShowIosInstallPrompt(false)} className="absolute top-2 right-2 text-blue-200 hover:text-white">✕</button>
                    <div className="flex items-start gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">📱</div>
                        <div>
                            <h4 className="font-bold text-sm">Installer l'application</h4>
                            <p className="text-xs text-blue-100 mt-1">Appuyez sur <strong>Partager</strong> puis <strong>"Sur l'écran d'accueil"</strong></p>
                        </div>
                    </div>
                </div>
           </div>
        </div>
      )}

      {pendingImport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-600 shadow-2xl">
            <div className="text-center mb-6"><h3 className="text-lg font-medium text-white">Remplacer l'inventaire ?</h3></div>
            <div className="grid grid-cols-2 gap-3">
                <button className="rounded-xl border border-gray-600 py-3 bg-gray-700 text-gray-300" onClick={() => setPendingImport(null)}>Annuler</button>
                <button className="rounded-xl bg-orange-600 text-white hover:bg-orange-700" onClick={confirmRestore}>Restaurer</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm pt-safe pb-safe">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6 text-white">Configuration</h3>
            <div className="mb-6">
              <label className="block text-sm font-bold text-blue-400 mb-2">Clé API Gemini</label>
              <input type="password" value={apiKey} onChange={(e) => handleSaveApiKey(e.target.value)} placeholder="Clé API..." className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white" />
              <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs text-blue-400 mt-2 block">Obtenir une clé</a>
            </div>
            <hr className="border-gray-700 mb-6" />
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Seuil stock faible: {lowStockThreshold}</label>
              <div className="flex items-center gap-4">
                <button onClick={() => setLowStockThreshold(Math.max(0, lowStockThreshold - 1))} className="w-10 h-10 rounded bg-gray-700 text-white">-</button>
                <button onClick={() => setLowStockThreshold(lowStockThreshold + 1)} className="w-10 h-10 rounded bg-gray-700 text-white">+</button>
              </div>
            </div>
            <hr className="border-gray-700 mb-6" />
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-3">Sauvegarde</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleExportData} className="bg-green-900/30 text-green-400 border border-green-900/50 py-3 rounded-lg text-sm">Sauvegarder</button>
                <button onClick={() => fileInputRef.current?.click()} className="bg-orange-900/30 text-orange-400 border border-orange-900/50 py-3 rounded-lg text-sm">Restaurer</button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
              </div>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold">Fermer</button>
          </div>
        </div>
      )}

      <header className="p-6 pb-2 flex items-center justify-between relative z-10">
         <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full relative ${!apiKey ? 'bg-red-900/30 text-red-400 animate-pulse' : 'bg-gray-800 text-gray-400'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          {!apiKey && <span className="absolute top-0 right-0 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
        </button>
        <div className="text-center"><h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">GestionStock</h1></div>
        <div className="w-10"></div>
      </header>

      <div className="grid grid-cols-2 gap-4 px-6 py-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-lg">
          <p className="text-xs text-gray-400 uppercase">Total</p>
          <p className="text-3xl font-bold text-white mt-1">{totalItems}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-lg">
          <p className="text-xs text-gray-400 uppercase">Alerte</p>
          <p className={`text-3xl font-bold mt-1 ${lowStockItemsCount > 0 ? 'text-red-500' : 'text-green-500'}`}>{lowStockItemsCount}</p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="px-6 py-2 h-40 w-full">
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={chartData}>
               <XAxis dataKey="name" tick={{fill: '#9ca3af', fontSize: 10}} interval={0} />
               <Tooltip contentStyle={{backgroundColor: '#1f2937', border: 'none'}} itemStyle={{color: '#fff'}} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
               <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                 {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'][index % 5]} />)}
               </Bar>
             </BarChart>
           </ResponsiveContainer>
        </div>
      )}

      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        {inventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600 border-2 border-dashed border-gray-800 rounded-xl mx-2">
            <p>Aucun produit</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inventory.sort((a, b) => b.lastUpdated - a.lastUpdated).map((item) => (
              <div key={item.barcode} className={`bg-gray-800 p-3 rounded-xl flex flex-col gap-3 border shadow-sm ${item.quantity <= lowStockThreshold ? 'border-red-900/30' : 'border-gray-700/50'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center text-xl">{item.emoji || '📦'}</div>
                  <div className="flex-1 min-w-0">
                    <input type="text" value={item.name} onChange={(e) => handleUpdateName(item.barcode, e.target.value)} className="bg-transparent text-gray-100 font-medium w-full rounded px-1 -ml-1 py-1 outline-none focus:ring-1 focus:ring-blue-500" />
                    <p className="text-xs text-gray-500 px-1 truncate">{item.barcode}</p>
                  </div>
                  <button onClick={() => { setActiveBarcode(item.barcode); setView(ViewState.PRODUCT_DETAILS); }} className="text-gray-500 hover:text-blue-400 p-2">➜</button>
                </div>
                <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-1 pl-3">
                    <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Stock</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleUpdateStock(item.barcode, -1)} className="w-10 h-9 flex items-center justify-center bg-gray-700 text-white rounded-md">-</button>
                        <div className={`w-14 text-center font-bold text-lg ${item.quantity <= lowStockThreshold ? 'text-red-500' : 'text-green-500'}`}>{item.quantity}</div>
                        <button onClick={() => handleUpdateStock(item.barcode, 1)} className="w-10 h-9 flex items-center justify-center bg-gray-700 text-white rounded-md">+</button>
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-10">
        <div className="flex gap-3 max-w-md mx-auto">
          <form onSubmit={handleManualSubmit} className="flex-1">
             <input type="text" inputMode="numeric" placeholder="Code-barres..." value={manualBarcodeInput} onChange={(e) => setManualBarcodeInput(e.target.value)} className="w-full h-14 bg-gray-800 border border-gray-600 rounded-xl px-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none shadow-xl" />
          </form>
          <button onClick={() => { if (!apiKey) { setShowSettings(true); alert("Clé API requise."); } else { setView(ViewState.SCANNER); } }} className="h-14 w-14 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 7. RENDER
// ==========================================

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
    