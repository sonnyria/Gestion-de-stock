import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- 1. TYPES & CONFIG ---

interface Product {
  barcode: string;
  name: string;
  quantity: number;
  category: string;
  emoji: string;
  lastUpdated: number;
}

enum ViewState {
  DASHBOARD = 'DASHBOARD',
  SCANNER = 'SCANNER',
  ADD_PRODUCT = 'ADD_PRODUCT',
  PRODUCT_DETAILS = 'PRODUCT_DETAILS'
}

// --- 2. SERVICES ---

const getAIClient = (): GoogleGenAI => {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) throw new Error("Clé API manquante");
  return new GoogleGenAI({ apiKey });
};

// Scanner natif avec Gemini
const readBarcodeWithGemini = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    const cleanBase64 = base64Image.replace(/^data:image\/.+;base64,/, "");

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: "Read the barcode numbers (EAN/UPC) from this image. Return ONLY the digits. If unreadable or no barcode, return NOT_FOUND." }
        ]
      },
      config: { temperature: 0.1 }
    });

    const text = response.text?.trim();
    if (!text || text.includes('NOT_FOUND')) return null;
    
    const match = text.replace(/\s/g, '').match(/[0-9A-Za-z]{8,}/);
    return match ? match[0] : (/^\d+$/.test(text) ? text : null);
  } catch (error) {
    console.error("Scan Error:", error);
    return null;
  }
};

// Enrichissement produit
const enhanceProductInfo = async (productName: string) => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Categorize "${productName}" and give an emoji.`,
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
    return JSON.parse(response.text || '{}');
  } catch (error) {
    return { category: "Divers", emoji: "📦", suggestedName: productName };
  }
};

// --- 3. COMPOSANTS ---

// 3.1 Scanner Caméra Natif (HTML5 Video)
// Remplace react-webcam pour éviter les erreurs de dépendances
const NativeScanner: React.FC<{ onScan: (code: string) => void; onCancel: () => void }> = ({ onScan, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = deviceList.filter(d => d.kind === 'videoinput');
        setDevices(videoInputs);

        const constraints = {
          video: {
            deviceId: activeDeviceId ? { exact: activeDeviceId } : undefined,
            facingMode: activeDeviceId ? undefined : 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera Error:", err);
        alert("Impossible d'accéder à la caméra. Vérifiez les permissions.");
        onCancel();
      }
    };

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [activeDeviceId, onCancel]);

  // Boucle de scan
  useEffect(() => {
    const interval = setInterval(async () => {
      if (scanning || !videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Capture frame
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          
          setScanning(true);
          // Envoi à Gemini
          const code = await readBarcodeWithGemini(dataUrl);
          if (code) {
            onScan(code);
          } else {
            setScanning(false);
          }
        }
      }
    }, 1500); // Scan toutes les 1.5s

    return () => clearInterval(interval);
  }, [scanning, onScan]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="relative flex-1 bg-black overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Overlay Visuel */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
           <div className={`w-72 h-48 border-2 rounded-xl relative transition-colors duration-300 ${scanning ? 'border-blue-500 bg-blue-500/20' : 'border-white/50'}`}>
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-[scan_2s_ease-in-out_infinite]"></div>
              <p className="absolute -bottom-10 left-0 right-0 text-center text-white font-bold text-sm bg-black/50 rounded-full py-1 px-3 mx-auto w-max">
                {scanning ? "Analyse IA..." : "Recherche code-barres..."}
              </p>
           </div>
        </div>

        {/* Selecteur Caméra */}
        {devices.length > 1 && (
          <select 
            value={activeDeviceId} 
            onChange={(e) => setActiveDeviceId(e.target.value)}
            className="absolute top-6 right-6 bg-black/50 text-white text-xs p-2 rounded-lg backdrop-blur border border-white/20 outline-none"
          >
            <option value="">Caméra Auto</option>
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${i+1}`}</option>)}
          </select>
        )}
      </div>

      <div className="bg-gray-900 p-6 pb-safe flex justify-center border-t border-gray-800">
        <button onClick={onCancel} className="px-8 py-3 bg-gray-800 rounded-full text-white font-medium border border-gray-700">Annuler</button>
      </div>
      <style>{`@keyframes scan { 0%,100% { top: 0; opacity: 0; } 50% { top: 100%; opacity: 1; } }`}</style>
    </div>
  );
};

// 3.2 Formulaire Produit
const ProductForm: React.FC<{ barcode: string; onSave: (p: Product) => void; onCancel: () => void }> = ({ barcode, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const [emoji, setEmoji] = useState('📦');
  const [cat, setCat] = useState('Divers');
  const [loading, setLoading] = useState(false);

  const handleAI = async () => {
    if (!name || loading) return;
    setLoading(true);
    const info = await enhanceProductInfo(name);
    if (info) {
      setEmoji(info.emoji);
      setCat(info.category);
      if (info.suggestedName) setName(info.suggestedName);
    }
    setLoading(false);
  };

  return (
    <div className="h-full bg-gray-900 p-6 pt-safe flex flex-col animate-slide-up">
      <h2 className="text-2xl font-bold mb-6 text-white">Nouveau Produit</h2>
      <div className="bg-gray-800 p-4 rounded-xl mb-6 border border-gray-700">
        <span className="text-xs text-gray-500 uppercase font-bold">Code-barres</span>
        <p className="text-xl font-mono text-blue-400 tracking-widest">{barcode}</p>
      </div>

      <div className="space-y-5 flex-1">
        <div>
          <label className="text-sm text-gray-400 block mb-2">Nom du produit</label>
          <div className="flex gap-2">
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-4 text-white outline-none focus:border-blue-500" 
              placeholder="Ex: Café grains 1kg"
            />
            <button onClick={handleAI} disabled={loading || !name} className="bg-purple-600 px-4 rounded-lg text-white font-bold disabled:opacity-50 flex items-center gap-2">
              {loading ? '...' : '✨ IA'}
            </button>
          </div>
        </div>

        <div className="flex gap-4">
           <div className="w-24">
             <label className="text-sm text-gray-400 block mb-2">Icône</label>
             <input value={emoji} onChange={e => setEmoji(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-center text-2xl outline-none" />
           </div>
           <div className="flex-1">
             <label className="text-sm text-gray-400 block mb-2">Quantité</label>
             <div className="flex items-center h-[60px] bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
               <button onClick={() => setQty(Math.max(0, qty-1))} className="w-14 h-full text-2xl text-gray-400 hover:bg-gray-700">-</button>
               <input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value)||0)} className="flex-1 bg-transparent text-center font-bold text-xl text-white outline-none" />
               <button onClick={() => setQty(qty+1)} className="w-14 h-full text-2xl text-gray-400 hover:bg-gray-700">+</button>
             </div>
           </div>
        </div>
      </div>

      <div className="flex gap-3 mt-auto pb-safe pt-4">
        <button onClick={onCancel} className="flex-1 py-4 bg-gray-800 rounded-xl font-bold text-gray-300">Annuler</button>
        <button onClick={() => onSave({ barcode, name, quantity: qty, category: cat, emoji, lastUpdated: Date.now() })} disabled={!name} className="flex-1 py-4 bg-blue-600 rounded-xl font-bold disabled:opacity-50 text-white shadow-lg shadow-blue-900/20">Enregistrer</button>
      </div>
    </div>
  );
};

// 3.3 Contrôle de Stock
const StockControl: React.FC<{ product: Product; onUpdate: (d: number) => void; onDelete: () => void; onClose: () => void }> = ({ product, onUpdate, onDelete, onClose }) => {
  const [confirm, setConfirm] = useState(false);
  
  return (
    <div className="h-full bg-gray-900 p-6 pt-safe flex flex-col animate-slide-up">
      <button onClick={onClose} className="self-start text-gray-400 mb-6 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Retour
      </button>
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="text-6xl mb-4">{product.emoji}</div>
          <h2 className="text-3xl font-bold leading-tight text-white">{product.name}</h2>
          <span className="inline-block mt-2 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">{product.category}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center bg-gray-800/50 rounded-3xl p-8 mb-8 border border-gray-800">
         <span className="text-sm text-gray-400 uppercase tracking-widest mb-2">En Stock</span>
         <span className="text-9xl font-bold text-white mb-8 tabular-nums">{product.quantity}</span>
         
         <div className="flex gap-4 w-full">
            <button onClick={() => onUpdate(-1)} className="flex-1 h-24 rounded-2xl bg-red-500/10 text-red-500 text-5xl border border-red-500/20 active:scale-95 transition flex items-center justify-center">-</button>
            <button onClick={() => onUpdate(1)} className="flex-1 h-24 rounded-2xl bg-green-500/10 text-green-500 text-5xl border border-green-500/20 active:scale-95 transition flex items-center justify-center">+</button>
         </div>
      </div>

      <div className="pb-safe">
        <button 
            onClick={() => confirm ? onDelete() : setConfirm(true)} 
            onMouseLeave={() => setConfirm(false)}
            className={`w-full py-4 rounded-xl font-bold transition-all ${confirm ? 'bg-red-600 text-white' : 'bg-gray-800 text-red-400 border border-red-900/30'}`}
        >
            {confirm ? 'Confirmer la suppression ?' : 'Supprimer du stock'}
        </button>
      </div>
    </div>
  );
};

// --- 4. APPLICATION PRINCIPALE ---

const App = () => {
  const [inventory, setInventory] = useState<Product[]>([]);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [manualCode, setManualCode] = useState('');

  // Chargement initial
  useEffect(() => {
    const saved = localStorage.getItem('stock_inventory');
    if (saved) {
      try {
        setInventory(JSON.parse(saved));
      } catch(e) { console.error(e); }
    }
  }, []);

  // Sauvegarde auto
  useEffect(() => {
    localStorage.setItem('stock_inventory', JSON.stringify(inventory));
  }, [inventory]);

  // Gestion clé API
  const handleSaveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  // Navigation
  const handleScan = (code: string) => {
    setActiveCode(code);
    const exists = inventory.find(p => p.barcode === code);
    setView(exists ? ViewState.PRODUCT_DETAILS : ViewState.ADD_PRODUCT);
  };

  const updateStock = (delta: number) => {
    if (!activeCode) return;
    setInventory(prev => prev.map(p => 
      p.barcode === activeCode ? { ...p, quantity: Math.max(0, p.quantity + delta), lastUpdated: Date.now() } : p
    ));
  };

  const deleteProduct = () => {
    if (!activeCode) return;
    setInventory(prev => prev.filter(p => p.barcode !== activeCode));
    setView(ViewState.DASHBOARD);
  };

  // Chart simple CSS (Pas de recharts pour stabilité)
  const chartData = [...inventory].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const maxQty = Math.max(...chartData.map(d => d.quantity), 1);

  // --- Rendu ---

  if (view === ViewState.SCANNER) {
    return <NativeScanner onScan={handleScan} onCancel={() => setView(ViewState.DASHBOARD)} />;
  }

  if (view === ViewState.ADD_PRODUCT && activeCode) {
    return <ProductForm barcode={activeCode} onSave={(p) => { setInventory([...inventory, p]); setView(ViewState.DASHBOARD); }} onCancel={() => setView(ViewState.DASHBOARD)} />;
  }

  if (view === ViewState.PRODUCT_DETAILS && activeCode) {
    const p = inventory.find(x => x.barcode === activeCode);
    if (p) return <StockControl product={p} onUpdate={updateStock} onDelete={deleteProduct} onClose={() => setView(ViewState.DASHBOARD)} />;
    else setView(ViewState.DASHBOARD);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col relative pb-safe">
      
      {/* Header */}
      <div className="p-6 pt-safe flex justify-between items-center z-10 bg-gray-900/90 backdrop-blur-sm sticky top-0">
        <button onClick={() => setShowSettings(true)} className={`p-2 rounded-full transition ${!apiKey ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-gray-800 text-gray-400'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <h1 className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">Stock AI</h1>
        <div className="w-10"></div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
           <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm border border-gray-700 shadow-2xl">
              <h3 className="font-bold text-xl mb-6">Paramètres</h3>
              
              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block">Clé API Gemini (Requise)</label>
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={e => handleSaveKey(e.target.value)} 
                  className="w-full bg-gray-900 border border-gray-600 p-3 rounded-lg text-white focus:border-blue-500 outline-none" 
                  placeholder="Collez votre clé ici..." 
                />
                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs text-blue-400 mt-2 inline-block hover:underline">Obtenir une clé gratuite →</a>
              </div>

              <div className="flex gap-2">
                <button onClick={() => {
                    const blob = new Blob([JSON.stringify(inventory)], {type:'application/json'});
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stock_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
                }} className="flex-1 bg-gray-700 text-gray-300 py-3 rounded-lg font-medium">Sauvegarder JSON</button>
                <button onClick={() => setShowSettings(false)} className="flex-1 bg-blue-600 py-3 rounded-lg text-white font-medium">Fermer</button>
              </div>
           </div>
        </div>
      )}

      {/* Dashboard Content */}
      <div className="px-4 mb-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6">
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
             <p className="text-xs text-gray-400 uppercase font-bold">Stock Total</p>
             <p className="text-3xl font-bold text-white mt-1">{inventory.reduce((a,c)=>a+c.quantity,0)}</p>
           </div>
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
             <p className="text-xs text-gray-400 uppercase font-bold">Références</p>
             <p className="text-3xl font-bold text-white mt-1">{inventory.length}</p>
           </div>
        </div>

        {/* Simple Chart */}
        {chartData.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 mb-6">
             <p className="text-xs text-gray-400 uppercase mb-4 font-bold">Top Produits</p>
             <div className="h-32 flex items-end gap-2">
                {chartData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute -top-6 text-[10px] bg-gray-900 px-1 rounded opacity-0 group-hover:opacity-100 transition">{d.quantity}</div>
                    <div style={{height: `${Math.max((d.quantity/maxQty)*100, 10)}%`}} className={`w-full rounded-t-md opacity-80 group-hover:opacity-100 transition-all ${['bg-blue-500','bg-purple-500','bg-pink-500', 'bg-indigo-500', 'bg-cyan-500'][i%5]}`}></div>
                  </div>
                ))}
             </div>
             <div className="flex text-[10px] text-gray-500 mt-2 gap-2">
                {chartData.map((d,i) => <div key={i} className="flex-1 text-center truncate">{d.name.substring(0,5)}</div>)}
             </div>
          </div>
        )}
      </div>

      {/* Product List */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-3">
        <div className="flex justify-between items-end mb-2 px-1">
          <h2 className="font-bold text-lg text-white">Inventaire</h2>
          <span className="text-xs text-gray-500">{inventory.length} produits</span>
        </div>
        
        {inventory.map(p => (
          <div key={p.barcode} onClick={() => { setActiveCode(p.barcode); setView(ViewState.PRODUCT_DETAILS); }} className="bg-gray-800 p-4 rounded-xl flex items-center gap-4 border border-gray-700 shadow-sm active:scale-[0.98] transition-transform cursor-pointer">
            <div className="w-12 h-12 bg-gray-700/50 rounded-xl flex items-center justify-center text-2xl">{p.emoji}</div>
            <div className="flex-1 min-w-0">
               <h3 className="font-bold text-white truncate">{p.name}</h3>
               <p className="text-xs text-gray-500 font-mono flex items-center gap-1">
                 <span className="w-2 h-2 rounded-full bg-gray-600"></span>
                 {p.barcode}
               </p>
            </div>
            <div className={`px-3 py-1 rounded-lg font-bold min-w-[3rem] text-center ${p.quantity < 3 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-gray-700 text-white'}`}>
               {p.quantity}
            </div>
          </div>
        ))}
        
        {inventory.length === 0 && (
          <div className="text-center py-10 text-gray-500 bg-gray-800/30 rounded-xl border border-dashed border-gray-700 mt-4">
            <p className="text-4xl mb-2">📦</p>
            <p>Inventaire vide</p>
            <p className="text-xs mt-1">Scannez un produit pour commencer</p>
          </div>
        )}
      </div>

      {/* Floating Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-40 pb-safe">
        <div className="flex gap-3 items-center">
            <input 
              type="text" 
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Code-barres manuel..." 
              className="flex-1 h-14 bg-gray-800 border border-gray-600 rounded-2xl px-5 text-white focus:border-blue-500 outline-none shadow-xl placeholder-gray-500"
            />
            <button 
              onClick={() => {
                 if (manualCode) { handleScan(manualCode); setManualCode(''); }
                 else if (!apiKey) { setShowSettings(true); }
                 else { setView(ViewState.SCANNER); }
              }}
              className={`h-14 w-14 rounded-2xl text-white flex items-center justify-center shadow-lg shadow-blue-600/20 transition transform active:scale-90 ${manualCode ? 'bg-green-600' : 'bg-blue-600'}`}
            >
              {manualCode ? (
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
              )}
            </button>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);