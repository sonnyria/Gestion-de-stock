import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- 1. TYPES & DATA ---

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

// --- 2. SERVICES (GEMINI) ---

const getAIClient = (): GoogleGenAI => {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    throw new Error("Clé API manquante.");
  }
  return new GoogleGenAI({ apiKey });
};

const readBarcodeWithGemini = async (base64Image: string): Promise<string | null> => {
  try {
    const ai = getAIClient();
    // Nettoyage base64
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: "Analyze this image to find a product barcode. Return ONLY the numbers. If no barcode is clearly visible, return NOT_FOUND." }
        ]
      },
      config: { temperature: 0.1 }
    });

    const text = response.text?.trim();
    if (!text || text.includes('NOT_FOUND')) return null;
    
    // Regex pour trouver une suite de chiffres (EAN/UPC)
    const match = text.replace(/\s/g, '').match(/[0-9]{8,14}/);
    return match ? match[0] : null;
  } catch (error: any) {
    if (error.message?.includes("API")) throw error;
    return null;
  }
};

const enhanceProductInfo = async (productName: string): Promise<ProductEnhancement> => {
  try {
    const ai = getAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Categorize "${productName}" and provide a specific emoji.`,
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
    if (response.text) {
        return JSON.parse(response.text) as ProductEnhancement;
    }
    throw new Error("Empty response");
  } catch (e) {
    return { category: "Divers", emoji: "📦", suggestedName: productName };
  }
};

// --- 3. COMPONENTS (INTÉGRÉS DIRECTEMENT) ---

// 3.1 NATIVE SCANNER (Remplaçant react-webcam pour éviter les erreurs de build)
const Scanner: React.FC<{ onScan: (code: string) => void; onCancel: () => void }> = ({ onScan, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(() => localStorage.getItem('scanner_device_id') || "");

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(devs => setDevices(devs.filter(d => d.kind === 'videoinput')))
      .catch(() => setError("Impossible de lister les caméras"));
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            facingMode: selectedDeviceId ? undefined : "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true"); // Important pour iOS
          await videoRef.current.play();
        }
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Accès caméra refusé ou impossible.");
      }
    };

    startCamera();

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [selectedDeviceId]);

  // Boucle de scan
  useEffect(() => {
    const interval = setInterval(async () => {
      if (scanning || !videoRef.current || videoRef.current.readyState !== 4) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Conversion en base64 légère (qualité 0.7)
      const imageSrc = canvas.toDataURL('image/jpeg', 0.7);

      setScanning(true);
      try {
        const code = await readBarcodeWithGemini(imageSrc);
        if (code) {
          // Petit son de succès
          const audio = new Audio('https://actions.google.com/sounds/v1/cartoon/pop.ogg');
          audio.play().catch(() => {});
          onScan(code);
        }
      } catch (e) {
        // Silencieux, on réessaie
      } finally {
        setScanning(false);
      }
    }, 2000); // Scan toutes les 2 secondes pour ne pas surcharger l'API

    return () => clearInterval(interval);
  }, [scanning, onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Sélecteur de caméra */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 pt-safe mt-2 flex justify-center">
        <select 
          className="bg-black/60 text-white border border-gray-500 rounded-full px-4 py-2 text-sm backdrop-blur-md appearance-none text-center"
          value={selectedDeviceId}
          onChange={e => {
            setSelectedDeviceId(e.target.value);
            localStorage.setItem('scanner_device_id', e.target.value);
          }}
        >
          <option value="">Caméra Automatique</option>
          {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${i+1}`}</option>)}
        </select>
      </div>

      {/* Flux Vidéo */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        <video 
          ref={videoRef} 
          className="absolute w-full h-full object-cover" 
          muted 
          playsInline 
        />
        
        {/* Viseur */}
        <div className="absolute inset-0 border-[40px] border-black/50 flex items-center justify-center pointer-events-none">
          <div className={`w-72 h-48 border-2 rounded-lg relative transition-colors duration-300 shadow-[0_0_50px_rgba(0,0,0,0.5)] ${scanning ? 'border-blue-500 bg-blue-500/10' : 'border-white/50'}`}>
             <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 -mt-1 -ml-1 border-white"></div>
             <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 -mt-1 -mr-1 border-white"></div>
             <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 -mb-1 -ml-1 border-white"></div>
             <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 -mb-1 -mr-1 border-white"></div>
             
             {/* Barre de scan animée */}
             <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 animate-[scan_2s_ease-in-out_infinite] opacity-50"></div>

             {scanning && (
               <div className="absolute inset-0 flex items-center justify-center">
                 <span className="text-blue-300 text-xs font-bold bg-black/60 px-2 py-1 rounded animate-pulse">ANALYSE IA...</span>
               </div>
             )}
          </div>
        </div>

        {error && (
          <div className="absolute top-1/2 left-4 right-4 text-center p-4 bg-red-600/90 text-white rounded-xl transform -translate-y-1/2">
            <p className="font-bold mb-2">Erreur Caméra</p>
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>

      <div className="h-24 bg-gray-900 flex items-center justify-center pb-safe border-t border-gray-800">
        <button onClick={onCancel} className="text-gray-300 border border-gray-600 hover:bg-gray-800 px-8 py-3 rounded-full font-medium transition">
          Annuler
        </button>
      </div>
      <style>{`
        @keyframes scan { 0%,100% { top: 0; opacity: 0; } 50% { top: 100%; opacity: 1; } }
      `}</style>
    </div>
  );
};

// 3.2 PRODUCT FORM
const ProductForm: React.FC<{ barcode: string; onSave: (p: Product) => void; onCancel: () => void }> = ({ barcode, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [emoji, setEmoji] = useState('📦');
  const [loading, setLoading] = useState(false);

  const handleAI = async () => {
    if (name.length < 3) return;
    setLoading(true);
    try {
      const info = await enhanceProductInfo(name);
      setEmoji(info.emoji);
      if(info.suggestedName) setName(info.suggestedName);
    } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6 animate-fade-in">
      <h2 className="text-2xl font-bold mb-6 text-blue-400">Nouveau Produit</h2>
      
      <div className="bg-gray-800 p-4 rounded-xl mb-6 border border-gray-700 shadow-lg">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Code-Barres</p>
        <p className="text-xl font-mono tracking-wider text-white">{barcode}</p>
      </div>
      
      <div className="flex flex-col gap-5 flex-1">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Nom du produit</label>
          <div className="flex gap-2">
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-4 text-lg focus:ring-2 focus:ring-blue-500 outline-none" 
              placeholder="Ex: Pâtes Barilla" 
              autoFocus
            />
            <button 
              type="button" 
              onClick={handleAI} 
              disabled={loading || name.length < 3} 
              className="bg-gradient-to-br from-purple-600 to-blue-600 px-4 rounded-lg text-xl shadow-lg disabled:opacity-50"
            >
              {loading ? <span className="animate-spin inline-block">↻</span> : '✨'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Appuyez sur ✨ pour générer l'icône automatiquement.</p>
        </div>

        <div className="flex gap-4">
           <div className="w-24">
             <label className="block text-sm text-gray-400 mb-2">Icône</label>
             <input 
               value={emoji} 
               onChange={e => setEmoji(e.target.value)} 
               className="w-full bg-gray-800 border border-gray-600 rounded-lg p-4 text-center text-2xl" 
             />
           </div>
           <div className="flex-1">
             <label className="block text-sm text-gray-400 mb-2">Quantité</label>
             <div className="flex items-center bg-gray-800 rounded-lg border border-gray-600 h-[66px]">
               <button onClick={() => setQuantity(q => Math.max(0, q-1))} className="w-14 h-full text-gray-400 text-2xl hover:bg-gray-700 rounded-l-lg">-</button>
               <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value)||0)} className="flex-1 bg-transparent text-center font-bold text-xl outline-none" />
               <button onClick={() => setQuantity(q => q+1)} className="w-14 h-full text-gray-400 text-2xl hover:bg-gray-700 rounded-r-lg">+</button>
             </div>
           </div>
        </div>
      </div>

      <div className="flex gap-3 mt-auto pt-4">
        <button onClick={onCancel} className="flex-1 py-4 bg-gray-800 rounded-xl font-medium text-gray-300">Annuler</button>
        <button onClick={() => name && onSave({ barcode, name, quantity, emoji, lastUpdated: Date.now() })} disabled={!name} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">Enregistrer</button>
      </div>
    </div>
  );
};

// 3.3 STOCK CONTROL
const StockControl: React.FC<{ product: Product; onUpdate: (d: number) => void; onDelete: () => void; onClose: () => void }> = ({ product, onUpdate, onDelete, onClose }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6 animate-fade-in">
      <button onClick={onClose} className="mb-6 text-gray-400 flex items-center gap-2 hover:text-white">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Retour
      </button>
      
      <div className="flex items-center gap-4 mb-8">
         <div className="text-6xl bg-gray-800 p-4 rounded-2xl shadow-inner border border-gray-700">{product.emoji}</div>
         <div>
           <h2 className="text-2xl font-bold leading-tight">{product.name}</h2>
           <p className="text-sm text-gray-500 font-mono mt-1">{product.barcode}</p>
         </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 bg-gray-800/30 rounded-3xl p-8 mb-8 border border-gray-800">
        <p className="text-gray-400 text-sm uppercase tracking-widest mb-4">En Stock</p>
        <div className="text-9xl font-bold mb-8 tabular-nums tracking-tighter">{product.quantity}</div>
        
        <div className="flex gap-4 w-full">
          <button 
            onClick={() => onUpdate(-1)} 
            className="flex-1 h-20 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-5xl rounded-2xl flex items-center justify-center border border-red-500/30 active:scale-95 transition"
          >
            -
          </button>
          <button 
            onClick={() => onUpdate(1)} 
            className="flex-1 h-20 bg-green-500/10 hover:bg-green-500/20 text-green-500 text-5xl rounded-2xl flex items-center justify-center border border-green-500/30 active:scale-95 transition"
          >
            +
          </button>
        </div>
      </div>

      <button 
        onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)} 
        className={`w-full py-4 rounded-xl font-bold transition-all ${confirmDelete ? 'bg-red-600 text-white scale-105 shadow-xl' : 'bg-gray-800 text-red-400 hover:bg-gray-700'}`}
      >
        {confirmDelete ? '⚠️ Confirmer la suppression ?' : 'Supprimer le produit'}
      </button>
      {confirmDelete && <div onClick={() => setConfirmDelete(false)} className="text-center text-gray-500 text-sm mt-3 cursor-pointer underline">Annuler la suppression</div>}
    </div>
  );
};

// 3.4 SIMPLE CSS CHART (Remplace Recharts pour éviter les bugs)
const SimpleBarChart: React.FC<{ data: {name: string, value: number}[] }> = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="h-40 flex items-end gap-2 pt-6 pb-2 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
          <div className="w-full relative flex items-end h-full rounded-t-md overflow-hidden bg-gray-800/50">
              <div 
                className={`w-full absolute bottom-0 transition-all duration-500 ${['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-green-500', 'bg-yellow-500'][i % 5]}`}
                style={{ height: `${(d.value / max) * 100}%` }}
              >
                  {d.value > 0 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-white">{d.value}</span>}
              </div>
          </div>
          <span className="text-[10px] text-gray-400 truncate w-full text-center">{d.name.substring(0,6)}</span>
        </div>
      ))}
    </div>
  );
};

// --- 4. MAIN APP ---

const App: React.FC = () => {
  const [inventory, setInventory] = useState<Product[]>([]);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');

  // Initialisation unique
  useEffect(() => {
    try {
      const savedInv = localStorage.getItem('stock_inventory');
      if (savedInv) setInventory(JSON.parse(savedInv));
      const savedKey = localStorage.getItem('gemini_api_key');
      if (savedKey) setApiKey(savedKey);
    } catch(e) { console.error(e); }
  }, []);

  // Sauvegarde automatique
  useEffect(() => {
    localStorage.setItem('stock_inventory', JSON.stringify(inventory));
  }, [inventory]);

  const handleScan = (code: string) => {
    setActiveId(code);
    const exists = inventory.find(p => p.barcode === code);
    setView(exists ? ViewState.PRODUCT_DETAILS : ViewState.ADD_PRODUCT);
  };

  const updateStock = (delta: number) => {
    if(!activeId) return;
    setInventory(prev => prev.map(p => p.barcode === activeId ? {...p, quantity: Math.max(0, p.quantity + delta), lastUpdated: Date.now()} : p));
  };

  const deleteProduct = () => {
    if(!activeId) return;
    setInventory(prev => prev.filter(p => p.barcode !== activeId));
    setView(ViewState.DASHBOARD);
  };

  // Routing visuel
  if (view === ViewState.SCANNER) return <Scanner onScan={handleScan} onCancel={() => setView(ViewState.DASHBOARD)} />;
  if (view === ViewState.ADD_PRODUCT && activeId) return <div className="pt-safe h-full"><ProductForm barcode={activeId} onSave={p => { setInventory(prev => [...prev, p]); setView(ViewState.DASHBOARD); }} onCancel={() => setView(ViewState.DASHBOARD)} /></div>;
  if (view === ViewState.PRODUCT_DETAILS && activeId) {
    const prod = inventory.find(p => p.barcode === activeId);
    if(prod) return <div className="pt-safe h-full"><StockControl product={prod} onUpdate={updateStock} onDelete={deleteProduct} onClose={() => setView(ViewState.DASHBOARD)} /></div>;
    // Fallback si produit non trouvé
    setView(ViewState.DASHBOARD);
  }

  const chartData = [...inventory].sort((a,b) => b.quantity - a.quantity).slice(0, 5).map(p => ({ name: p.name, value: p.quantity }));
  const totalStock = inventory.reduce((a,b) => a+b.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col pt-safe pb-safe relative overflow-hidden">
      {/* Header */}
      <header className="p-4 flex justify-between items-center border-b border-gray-800 bg-gray-900/90 backdrop-blur z-10">
        <button onClick={() => setSettingsOpen(true)} className={`p-2 rounded-full transition ${!apiKey ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-gray-400 hover:bg-gray-800'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <h1 className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">GestionStock</h1>
        <div className="w-10"></div>
      </header>

      {/* Dashboard Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-lg">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Total Unités</p>
            <p className="text-3xl font-bold mt-1">{totalStock}</p>
          </div>
          <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 shadow-lg">
            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Produits</p>
            <p className="text-3xl font-bold mt-1 text-blue-400">{inventory.length}</p>
          </div>
        </div>

        {/* Chart */}
        {inventory.length > 0 && (
          <div className="mb-8 bg-gray-800/50 rounded-2xl p-4 border border-gray-700/50">
             <p className="text-xs text-gray-500 mb-2 uppercase tracking-widest">Top 5 Stocks</p>
             <SimpleBarChart data={chartData} />
          </div>
        )}

        {/* Liste des produits */}
        <div className="space-y-3">
          {inventory.sort((a,b) => b.lastUpdated - a.lastUpdated).map(p => (
            <div key={p.barcode} className="bg-gray-800 p-3 pr-4 rounded-xl flex items-center justify-between border border-gray-700 shadow-md active:scale-[0.99] transition-transform">
              <div 
                className="flex items-center gap-4 flex-1 cursor-pointer"
                onClick={() => { setActiveId(p.barcode); setView(ViewState.PRODUCT_DETAILS); }}
              >
                <span className="text-3xl bg-gray-700/50 w-12 h-12 flex items-center justify-center rounded-lg">{p.emoji}</span>
                <div className="min-w-0">
                  <p className="font-semibold truncate text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{p.barcode}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 border-l border-gray-700 pl-3 ml-2">
                <button 
                    onClick={(e) => { e.stopPropagation(); updateStock(-1); setActiveId(p.barcode); }} // Hack rapide: set activeId to act on correct item if multiple clicks
                    className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-red-900/50 text-gray-300 hover:text-red-400 rounded"
                >
                    -
                </button>
                <span className={`font-bold text-lg w-6 text-center ${p.quantity < 3 ? 'text-red-500' : 'text-green-500'}`}>{p.quantity}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); updateStock(1); setActiveId(p.barcode); }}
                    className="w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-green-900/50 text-gray-300 hover:text-green-400 rounded"
                >
                    +
                </button>
              </div>
            </div>
          ))}
          
          {inventory.length === 0 && (
            <div className="text-center text-gray-500 py-12 border-2 border-dashed border-gray-800 rounded-2xl mx-4">
              <p className="text-4xl mb-2">📷</p>
              <p>Votre stock est vide.</p>
              <p className="text-sm mt-2">Scannez votre premier produit !</p>
            </div>
          )}
        </div>
      </div>

      {/* Barre d'actions flottante */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-20">
        <div className="flex gap-3 max-w-md mx-auto">
          <form onSubmit={e => { e.preventDefault(); if(manualInput) handleScan(manualInput); setManualInput(''); }} className="flex-1">
            <input 
              value={manualInput} 
              onChange={e => setManualInput(e.target.value)} 
              placeholder="Saisie manuelle..." 
              inputMode="numeric"
              className="w-full h-14 bg-gray-800 rounded-xl px-5 border border-gray-700 text-white outline-none focus:ring-2 focus:ring-blue-500 shadow-xl placeholder-gray-500" 
            />
          </form>
          <button 
            onClick={() => apiKey ? setView(ViewState.SCANNER) : setSettingsOpen(true)}
            className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/40 active:scale-90 transition-transform"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          </button>
        </div>
      </div>

      {/* Modal Paramètres */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-700">
            <h3 className="font-bold text-lg mb-4 text-white">Paramètres</h3>
            
            <label className="block text-sm font-bold text-blue-400 mb-2">Clé API Gemini</label>
            <input 
                type="password" 
                value={apiKey} 
                onChange={e => { setApiKey(e.target.value); localStorage.setItem('gemini_api_key', e.target.value); }} 
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 mb-2 text-white focus:border-blue-500 outline-none" 
                placeholder="Collez votre clé ici..." 
            />
            <p className="text-xs text-gray-500 mb-6">Requise pour le scan et l'enrichissement automatique.</p>
            
            <button onClick={() => setSettingsOpen(false)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold mb-4">Fermer</button>
            
            <div className="border-t border-gray-700 pt-4 text-center">
                <button onClick={() => { 
                    const blob = new Blob([JSON.stringify(inventory)], {type:'application/json'});
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `stock-${Date.now()}.json`; a.click();
                }} className="text-sm text-green-500 hover:underline">↓ Exporter mes données (Backup)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
