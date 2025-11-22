
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPES ---
interface Product {
  barcode: string;
  name: string;
  quantity: number;
  category?: string;
  emoji?: string;
  lastUpdated: number;
}

enum ViewState {
  DASHBOARD = 'DASHBOARD',
  SCANNER = 'SCANNER',
  ADD_PRODUCT = 'ADD_PRODUCT',
  PRODUCT_DETAILS = 'PRODUCT_DETAILS'
}

interface ProductEnhancement {
  category: string;
  emoji: string;
  suggestedName?: string;
}

// --- SERVICES ---
const getAIClient = (): GoogleGenAI => {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) throw new Error("Clé API manquante.");
  return new GoogleGenAI({ apiKey });
};

const readBarcodeWithGemini = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp', // Modèle rapide
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: "Return ONLY the barcode number visible in this image. If none, return 'NOT_FOUND'." }
        ]
      },
      config: { temperature: 0.1 }
    });

    const text = response.text?.trim();
    if (!text || text.includes('NOT_FOUND')) return null;
    
    const match = text.replace(/\s/g, '').match(/[0-9A-Za-z]{8,}/);
    return match ? match[0] : (/^\d+$/.test(text) ? text : null);
  } catch (error) {
    console.error("Gemini Scan Error:", error);
    return null;
  }
};

const enhanceProductInfo = async (productName: string): Promise<ProductEnhancement> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: `Categorize "${productName}" and provide an emoji.`,
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
    
    return JSON.parse(response.text || '{}') as ProductEnhancement;
  } catch (error) {
    console.error("Enhance Error:", error);
    return { category: "Divers", emoji: "📦", suggestedName: productName };
  }
};

// --- COMPONENT: SCANNER (Native HTML5 Implementation) ---
const Scanner: React.FC<{ onScan: (code: string) => void; onCancel: () => void }> = ({ onScan, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem('scanner_device_id') || '');
  const [error, setError] = useState<string | null>(null);

  // Init Camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        // Get devices first
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices(devs.filter(d => d.kind === 'videoinput'));

        const constraints = {
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            facingMode: selectedDeviceId ? undefined : 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setError(null);
      } catch (err) {
        console.error("Camera Error:", err);
        setError("Impossible d'accéder à la caméra.");
      }
    };

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [selectedDeviceId]);

  // Auto Scan Loop
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!videoRef.current || scanning || error) return;

      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.8);

      setScanning(true);
      const barcode = await readBarcodeWithGemini(base64);
      if (barcode) {
        onScan(barcode);
      } else {
        setScanning(false);
      }
    }, 2000); // Scan every 2s

    return () => clearInterval(interval);
  }, [scanning, onScan, error]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden bg-black">
        {/* Camera Controls */}
        <div className="absolute top-4 left-0 right-0 z-30 flex justify-center pt-safe">
           <select 
             value={selectedDeviceId} 
             onChange={(e) => { setSelectedDeviceId(e.target.value); localStorage.setItem('scanner_device_id', e.target.value); }}
             className="bg-black/60 text-white border border-gray-500 rounded-full px-4 py-2 backdrop-blur-sm"
           >
             <option value="">Caméra Auto</option>
             {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${i+1}`}</option>)}
           </select>
        </div>

        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />

        {/* Overlay */}
        <div className="absolute inset-0 border-[40px] border-black/50 flex items-center justify-center pointer-events-none">
          <div className={`w-72 h-48 border-2 rounded-lg relative transition-colors duration-300 ${scanning ? 'border-blue-500 bg-blue-500/10' : 'border-white/50'}`}>
             <div className="absolute inset-0 animate-[scan_2s_ease-in-out_infinite] bg-gradient-to-b from-transparent via-blue-400/50 to-transparent h-1 w-full top-1/2"></div>
          </div>
        </div>

        {scanning && (
          <div className="absolute bottom-24 left-0 right-0 text-center">
            <span className="bg-blue-600/90 text-white px-4 py-2 rounded-full text-sm font-bold animate-pulse">
              Analyse Gemini...
            </span>
          </div>
        )}
      </div>

      <div className="bg-gray-900 p-6 pb-safe flex justify-center">
        <button onClick={onCancel} className="px-8 py-3 bg-gray-800 rounded-full text-white font-medium border border-gray-700">
          Annuler
        </button>
      </div>
      <style>{`@keyframes scan { 0% { top: 0%; } 100% { top: 100%; } }`}</style>
    </div>
  );
};

// --- COMPONENT: PRODUCT FORM ---
const ProductForm: React.FC<{ barcode: string; onSave: (p: Product) => void; onCancel: () => void }> = ({ barcode, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [emoji, setEmoji] = useState('📦');
  const [loading, setLoading] = useState(false);

  const handleAI = async () => {
    if (!name) return;
    setLoading(true);
    const info = await enhanceProductInfo(name);
    setEmoji(info.emoji);
    if (info.suggestedName) setName(info.suggestedName);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6 pt-safe animate-fade-in">
      <h2 className="text-2xl font-bold mb-6">🆕 Nouveau Produit</h2>
      <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700 font-mono text-blue-400 text-center text-xl tracking-widest">
        {barcode}
      </div>
      
      <div className="flex gap-2 mb-4">
        <input 
          value={name} onChange={e => setName(e.target.value)} 
          placeholder="Nom (ex: Lait 1L)" 
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 outline-none focus:border-blue-500 transition"
        />
        <button onClick={handleAI} disabled={loading || !name} className="bg-purple-600 px-4 rounded-lg disabled:opacity-50">
          {loading ? '...' : '✨'}
        </button>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="w-16">
          <label className="text-xs text-gray-400 block mb-1">Icône</label>
          <input value={emoji} onChange={e => setEmoji(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-center text-xl" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 block mb-1">Stock</label>
          <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 h-[54px]">
            <button onClick={() => setQuantity(Math.max(0, quantity-1))} className="w-12 h-full text-xl">-</button>
            <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value)||0)} className="flex-1 text-center bg-transparent font-bold" />
            <button onClick={() => setQuantity(quantity+1)} className="w-12 h-full text-xl">+</button>
          </div>
        </div>
      </div>

      <div className="mt-auto flex gap-3">
        <button onClick={onCancel} className="flex-1 py-4 bg-gray-800 rounded-xl font-medium">Annuler</button>
        <button onClick={() => onSave({ barcode, name, quantity, emoji, category: 'Divers', lastUpdated: Date.now() })} disabled={!name} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold disabled:opacity-50 shadow-lg shadow-blue-900/20">Enregistrer</button>
      </div>
    </div>
  );
};

// --- COMPONENT: STOCK CONTROL ---
const StockControl: React.FC<{ product: Product; onUpdate: (b: string, d: number) => void; onDelete: (b: string) => void; onClose: () => void }> = ({ product, onUpdate, onDelete, onClose }) => {
  const [confirmDel, setConfirmDel] = useState(false);
  
  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6 pt-safe animate-fade-in">
      <button onClick={onClose} className="mb-6 text-gray-400 flex items-center gap-2">← Retour</button>
      <div className="flex items-center gap-4 mb-8">
        <span className="text-5xl">{product.emoji}</span>
        <div>
          <h2 className="text-2xl font-bold">{product.name}</h2>
          <p className="font-mono text-blue-400">{product.barcode}</p>
        </div>
      </div>

      <div className="bg-gray-800/50 rounded-2xl p-8 flex flex-col items-center justify-center flex-1 border border-gray-700">
        <span className="text-sm text-gray-400 uppercase tracking-widest mb-4">En Stock</span>
        <span className="text-8xl font-bold mb-8">{product.quantity}</span>
        <div className="flex gap-4 w-full max-w-xs">
          <button onClick={() => onUpdate(product.barcode, -1)} className="flex-1 h-20 bg-red-500/20 text-red-500 rounded-2xl text-4xl border border-red-500/30 active:scale-95 transition">-</button>
          <button onClick={() => onUpdate(product.barcode, 1)} className="flex-1 h-20 bg-green-500/20 text-green-500 rounded-2xl text-4xl border border-green-500/30 active:scale-95 transition">+</button>
        </div>
      </div>

      <div className="mt-8">
        <button 
          onClick={() => confirmDel ? onDelete(product.barcode) : setConfirmDel(true)} 
          onMouseLeave={() => setConfirmDel(false)}
          className={`w-full py-4 rounded-xl font-bold transition ${confirmDel ? 'bg-red-600 text-white' : 'bg-red-900/10 text-red-400 border border-red-900/30'}`}
        >
          {confirmDel ? 'Confirmer la suppression ?' : 'Supprimer'}
        </button>
      </div>
    </div>
  );
};

// --- MAIN APP ---
const App: React.FC = () => {
  const [inventory, setInventory] = useState<Product[]>(() => JSON.parse(localStorage.getItem('stock_inventory') || '[]'));
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [manualInput, setManualInput] = useState('');

  useEffect(() => { localStorage.setItem('stock_inventory', JSON.stringify(inventory)); }, [inventory]);

  const handleScan = (code: string) => {
    setActiveBarcode(code);
    setView(inventory.find(p => p.barcode === code) ? ViewState.PRODUCT_DETAILS : ViewState.ADD_PRODUCT);
  };

  // Render Helpers
  if (view === ViewState.SCANNER) return <Scanner onScan={handleScan} onCancel={() => setView(ViewState.DASHBOARD)} />;
  if (view === ViewState.ADD_PRODUCT && activeBarcode) return <ProductForm barcode={activeBarcode} onSave={p => { setInventory([...inventory, p]); setView(ViewState.DASHBOARD); }} onCancel={() => setView(ViewState.DASHBOARD)} />;
  if (view === ViewState.PRODUCT_DETAILS && activeBarcode) {
    const p = inventory.find(i => i.barcode === activeBarcode);
    if (p) return <StockControl product={p} onUpdate={(b, d) => setInventory(inv => inv.map(i => i.barcode === b ? { ...i, quantity: Math.max(0, i.quantity + d), lastUpdated: Date.now() } : i))} onDelete={b => { setInventory(inv => inv.filter(i => i.barcode !== b)); setView(ViewState.DASHBOARD); }} onClose={() => setView(ViewState.DASHBOARD)} />;
  }

  // Stats for charts
  const topProducts = [...inventory].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const maxQty = Math.max(...topProducts.map(p => p.quantity), 1);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 pb-24 pt-safe">
      {/* Header */}
      <header className="p-6 flex justify-between items-center sticky top-0 bg-gray-900/95 backdrop-blur z-20 border-b border-gray-800">
        <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full ${!apiKey ? 'bg-red-900/30 text-red-400 animate-pulse' : 'text-gray-400'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">GestionStock</h1>
        <div className="w-10" />
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700">
            <h3 className="text-xl font-bold mb-4">Configuration</h3>
            <label className="block text-sm text-blue-400 mb-2">Clé API Gemini</label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value); }} className="w-full bg-gray-900 border border-gray-600 rounded p-3 mb-6 text-sm" placeholder="Coller la clé ici" />
            <div className="flex gap-3">
                <button onClick={() => {
                    const blob = new Blob([JSON.stringify(inventory)], {type: 'application/json'});
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backup.json'; a.click();
                }} className="flex-1 bg-green-900/30 text-green-400 py-3 rounded-lg border border-green-900/50">Sauvegarder</button>
                <label className="flex-1 bg-orange-900/30 text-orange-400 py-3 rounded-lg border border-orange-900/50 text-center cursor-pointer">
                    Restaurer
                    <input type="file" className="hidden" accept=".json" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if(file) {
                            const r = new FileReader();
                            r.onload = (ev) => { try { setInventory(JSON.parse(ev.target?.result as string)); setShowSettings(false); } catch(err) { alert('Erreur fichier'); } };
                            r.readAsText(file);
                        }
                    }}/>
                </label>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full mt-6 py-3 bg-blue-600 rounded-xl font-bold">Fermer</button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4 mb-6">
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow">
              <div className="text-xs text-gray-400 uppercase">Total</div>
              <div className="text-3xl font-bold text-white">{inventory.reduce((acc, i) => acc + i.quantity, 0)}</div>
           </div>
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow">
              <div className="text-xs text-gray-400 uppercase">Refs</div>
              <div className="text-3xl font-bold text-blue-400">{inventory.length}</div>
           </div>
        </div>

        {/* Simple CSS Bar Chart */}
        {topProducts.length > 0 && (
            <div className="mb-6">
                <p className="text-xs text-gray-500 uppercase mb-3">Top Stock</p>
                <div className="space-y-3">
                    {topProducts.map((p, i) => (
                        <div key={p.barcode} className="flex items-center gap-2 text-xs">
                            <span className="w-20 truncate text-gray-400">{p.name}</span>
                            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full rounded-full" 
                                    style={{ 
                                        width: `${(p.quantity / maxQty) * 100}%`,
                                        backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'][i % 5]
                                    }}
                                ></div>
                            </div>
                            <span className="w-8 text-right font-mono">{p.quantity}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="space-y-3">
          {inventory.length === 0 ? <div className="text-center text-gray-500 py-10 border-2 border-dashed border-gray-800 rounded-xl">Aucun produit<br/><span className="text-xs">Scannez pour commencer</span></div> : 
            inventory.sort((a,b) => b.lastUpdated - a.lastUpdated).map(p => (
              <div key={p.barcode} onClick={() => { setActiveBarcode(p.barcode); setView(ViewState.PRODUCT_DETAILS); }} className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex items-center gap-3 active:bg-gray-700 transition">
                <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center text-xl">{p.emoji}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate text-white">{p.name}</h3>
                  <p className="text-xs text-gray-500">{p.barcode}</p>
                </div>
                <div className={`px-3 py-1 rounded-md font-bold ${p.quantity < 3 ? 'bg-red-900/30 text-red-400' : 'bg-gray-900 text-gray-300'}`}>
                   {p.quantity}
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Footer Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-10 flex gap-3 max-w-lg mx-auto">
         <form onSubmit={e => {e.preventDefault(); if(manualInput) handleScan(manualInput); setManualInput(''); }} className="flex-1">
            <input type="text" value={manualInput} onChange={e => setManualInput(e.target.value)} placeholder="Code manuel..." className="w-full h-14 bg-gray-800 rounded-xl px-4 border border-gray-600 text-white shadow-xl focus:ring-2 focus:ring-blue-500 outline-none" />
         </form>
         <button onClick={() => apiKey ? setView(ViewState.SCANNER) : alert('Clé API requise')} className="h-14 w-14 bg-blue-600 rounded-xl text-white flex items-center justify-center shadow-lg shadow-blue-600/30 active:scale-95 transition">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
         </button>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}
