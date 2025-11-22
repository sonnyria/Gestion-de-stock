import React, { useState, useEffect, useRef } from 'react';
import { Product, ViewState } from './types';
import Scanner from './components/Scanner';
import ProductForm from './components/ProductForm';
import StockControl from './components/StockControl';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const App: React.FC = () => {
  // --- State ---
  const [inventory, setInventory] = useState<Product[]>([]);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [activeBarcode, setActiveBarcode] = useState<string | null>(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  
  // Settings State
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(3);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import State
  const [pendingImport, setPendingImport] = useState<{ inventory: Product[], settings?: { threshold: number } } | null>(null);

  // iOS Install Prompt State
  const [showIosInstallPrompt, setShowIosInstallPrompt] = useState(false);

  // --- Persistence & Checks ---
  useEffect(() => {
    const savedInventory = localStorage.getItem('stock_inventory');
    if (savedInventory) {
      try {
        setInventory(JSON.parse(savedInventory));
      } catch (e) {
        console.error("Failed to load inventory", e);
      }
    }

    const savedSettings = localStorage.getItem('stock_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.threshold === 'number') {
          setLowStockThreshold(parsed.threshold);
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    }

    const savedApiKey = localStorage.getItem('gemini_api_key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }

    // Check if device is iOS and running in browser (not standalone)
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    if (isIos && !isStandalone) {
        // Show prompt after a short delay
        const timer = setTimeout(() => setShowIosInstallPrompt(true), 2000);
        return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('stock_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('stock_settings', JSON.stringify({ threshold: lowStockThreshold }));
  }, [lowStockThreshold]);

  const handleSaveApiKey = (val: string) => {
    setApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  // --- Backup / Restore Logic ---

  const prepareBackupData = () => {
    return {
      timestamp: new Date().toISOString(),
      inventory: inventory,
      settings: { threshold: lowStockThreshold }
    };
  };

  // Regular export button (settings menu)
  const handleExportData = () => {
    const data = prepareBackupData();
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

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        if (data.inventory && Array.isArray(data.inventory)) {
          setPendingImport(data);
        } else {
          alert("Format de fichier invalide. Le fichier doit contenir une liste d'inventaire.");
        }
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la lecture du fichier JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const confirmRestore = () => {
    if (pendingImport) {
      setInventory(pendingImport.inventory);
      if (pendingImport.settings?.threshold !== undefined) {
        setLowStockThreshold(pendingImport.settings.threshold);
      }
      setPendingImport(null);
      setShowSettings(false);
    }
  };

  // --- Logic ---

  const handleScan = (barcode: string) => {
    setActiveBarcode(barcode);
    const exists = inventory.find(p => p.barcode === barcode);
    if (exists) {
      setView(ViewState.PRODUCT_DETAILS);
    } else {
      setView(ViewState.ADD_PRODUCT);
    }
  };

  const handleAddProduct = (newProduct: Product) => {
    setInventory(prev => [...prev, newProduct]);
    setView(ViewState.DASHBOARD);
    setActiveBarcode(null);
  };

  const handleUpdateStock = (barcode: string, delta: number) => {
    setInventory(prev => prev.map(p => {
      if (p.barcode === barcode) {
        return { ...p, quantity: Math.max(0, p.quantity + delta), lastUpdated: Date.now() };
      }
      return p;
    }));
  };

  const handleUpdateName = (barcode: string, newName: string) => {
    setInventory(prev => prev.map(p => {
      if (p.barcode === barcode) {
        return { ...p, name: newName, lastUpdated: Date.now() };
      }
      return p;
    }));
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

  // --- Dashboard Stats ---
  const totalItems = inventory.reduce((acc, curr) => acc + curr.quantity, 0);
  const lowStockItemsCount = inventory.filter(i => i.quantity <= lowStockThreshold).length;

  // Chart Data
  const chartData = [...inventory]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map(product => ({
      name: product.name.length > 15 ? product.name.substring(0, 15) + '...' : product.name,
      value: product.quantity
    }));

  // --- Render ---

  if (view === ViewState.SCANNER) {
    return <Scanner onScan={handleScan} onCancel={() => setView(ViewState.DASHBOARD)} />;
  }

  if (view === ViewState.ADD_PRODUCT && activeBarcode) {
    return (
      <div className="pt-safe h-full bg-gray-900">
        <ProductForm
            barcode={activeBarcode}
            onSave={handleAddProduct}
            onCancel={() => setView(ViewState.DASHBOARD)}
        />
      </div>
    );
  }

  if (view === ViewState.PRODUCT_DETAILS && activeBarcode) {
    const product = inventory.find(p => p.barcode === activeBarcode);
    if (product) {
      return (
        <div className="pt-safe h-full bg-gray-900">
            <StockControl
            product={product}
            onUpdateStock={handleUpdateStock}
            onDelete={handleDeleteProduct}
            onClose={() => setView(ViewState.DASHBOARD)}
            />
        </div>
      );
    }
     setView(ViewState.DASHBOARD);
     return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col relative pt-safe">
      
      {/* iOS Install Prompt Banner */}
      {showIosInstallPrompt && (
        <div className="fixed top-0 left-0 right-0 z-[100] pt-safe animate-fade-in pointer-events-none">
           <div className="p-4 pointer-events-auto">
                <div className="bg-blue-600/95 text-white p-4 rounded-xl shadow-2xl border border-blue-400 relative backdrop-blur-sm">
                    <button 
                        onClick={() => setShowIosInstallPrompt(false)}
                        className="absolute top-2 right-2 text-blue-200 hover:text-white"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                    <div className="flex items-start gap-3">
                        <div className="bg-white/20 p-2 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="font-bold text-sm">Installer l'application</h4>
                            <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                            Pour une meilleure expérience :<br/>
                            1. Appuyez sur le bouton <strong>Partager</strong> <span className="inline-block align-middle"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg></span><br/>
                            2. Sélectionnez <strong>"Sur l'écran d'accueil"</strong>
                            </p>
                        </div>
                    </div>
                    {/* Little arrow pointing down to help user find the share button */}
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 rotate-45 w-4 h-4 bg-blue-600"></div>
                </div>
           </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {pendingImport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-600 shadow-2xl transform transition-all scale-100">
            <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-900/30 mb-4 border border-orange-500/30">
                    <svg className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-lg leading-6 font-medium text-white">Remplacer l'inventaire ?</h3>
                <div className="mt-2">
                    <p className="text-sm text-gray-400">
                        L'inventaire actuel sera <strong>complètement remplacé</strong> par celui du fichier de sauvegarde.
                    </p>
                </div>
            </div>

            <div className="bg-gray-900/50 rounded-lg p-3 mb-6 border border-gray-700 text-sm">
                <div className="flex justify-between mb-1">
                    <span className="text-gray-500">Produits actuels :</span>
                    <span className="text-white font-mono">{inventory.length}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-orange-400 font-bold">Produits importés :</span>
                    <span className="text-orange-400 font-mono font-bold">{pendingImport.inventory.length}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-xl border border-gray-600 shadow-sm px-4 py-3 bg-gray-700 text-base font-medium text-gray-300 hover:text-white hover:bg-gray-600 focus:outline-none sm:text-sm transition"
                    onClick={() => setPendingImport(null)}
                >
                    Annuler
                </button>
                <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-3 bg-orange-600 text-base font-medium text-white hover:bg-orange-700 focus:outline-none sm:text-sm transition"
                    onClick={confirmRestore}
                >
                    Restaurer
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in pt-safe pb-safe">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6 text-white flex items-center gap-2 border-b border-gray-700 pb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configuration
            </h3>
            
            {/* Gemini API Key */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-blue-400 mb-2">Clé API Gemini (Requise)</label>
              <input 
                type="password"
                value={apiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="Collez votre clé AI Studio ici"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="flex justify-between items-center mt-2">
                  <p className="text-[10px] text-gray-500">
                    Stockée localement sur l'appareil.
                  </p>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                  >
                    Obtenir une clé
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
              </div>
            </div>

            <hr className="border-gray-700 mb-6" />

            {/* Stock Threshold */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Seuil d'alerte stock faible</label>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setLowStockThreshold(Math.max(0, lowStockThreshold - 1))}
                  className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-xl"
                >
                  -
                </button>
                <span className="text-2xl font-mono font-bold text-white min-w-[2ch] text-center">
                  {lowStockThreshold}
                </span>
                <button 
                  onClick={() => setLowStockThreshold(lowStockThreshold + 1)}
                  className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-xl"
                >
                  +
                </button>
              </div>
            </div>

            <hr className="border-gray-700 mb-6" />

            {/* Backup / Restore */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-3">Sauvegarde Manuelle</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleExportData}
                  className="bg-green-900/30 hover:bg-green-900/50 text-green-400 border border-green-900/50 py-3 px-2 rounded-lg text-sm font-medium flex flex-col items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Sauvegarder
                </button>
                <button
                  onClick={handleImportClick}
                  className="bg-orange-900/30 hover:bg-orange-900/50 text-orange-400 border border-orange-900/50 py-3 px-2 rounded-lg text-sm font-medium flex flex-col items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Restaurer
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json"
                  className="hidden"
                />
              </div>
            </div>

            <button 
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-6 pb-2 flex items-center justify-between relative z-10">
         {/* Settings Button (Left) */}
         <button 
          onClick={() => setShowSettings(true)}
          className={`p-2 rounded-full transition relative ${!apiKey ? 'bg-red-900/30 text-red-400 animate-pulse' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {!apiKey && (
             <span className="absolute top-0 right-0 flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
             </span>
          )}
        </button>

        <div className="text-center">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
            GestionStock
          </h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Local Storage</p>
        </div>
        
        {/* Empty spacer to keep title centered */}
        <div className="w-10"></div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 px-6 py-4">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-lg">
          <p className="text-xs text-gray-400 uppercase">Total Unités</p>
          <p className="text-3xl font-bold text-white mt-1">{totalItems}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-lg">
          <p className="text-xs text-gray-400 uppercase">Alerte Stock (≤{lowStockThreshold})</p>
          <p className={`text-3xl font-bold mt-1 ${lowStockItemsCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
            {lowStockItemsCount}
          </p>
        </div>
      </div>

      {/* Chart Section */}
      {chartData.length > 0 && (
        <div className="px-6 py-2 h-40 w-full">
           <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Répartition par Produit (Top 5)</p>
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={chartData}>
               <XAxis dataKey="name" tick={{fill: '#9ca3af', fontSize: 10}} interval={0} />
               <Tooltip 
                 contentStyle={{backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'}}
                 itemStyle={{color: '#fff'}}
                 cursor={{fill: 'rgba(255,255,255,0.05)'}}
               />
               <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                 {chartData.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'][index % 5]} />
                 ))}
               </Bar>
             </BarChart>
           </ResponsiveContainer>
        </div>
      )}

      {/* Inventory List */}
      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        <div className="flex items-center justify-between mb-4 mt-4 px-2">
           <h2 className="text-lg font-semibold text-white">Mes Produits</h2>
           <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">{inventory.length} refs</span>
        </div>
        
        {inventory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600 border-2 border-dashed border-gray-800 rounded-xl mx-2">
            <p>Aucun produit</p>
            <p className="text-xs mt-1">Utilisez le scanner pour commencer</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inventory.sort((a, b) => b.lastUpdated - a.lastUpdated).map((item) => {
              const isLowStock = item.quantity <= lowStockThreshold;
              return (
                <div 
                  key={item.barcode} 
                  className={`bg-gray-800 p-3 rounded-xl flex flex-col gap-3 border shadow-sm ${isLowStock ? 'border-red-900/30' : 'border-gray-700/50'}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Emoji Icon */}
                    <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex flex-shrink-0 items-center justify-center text-xl">
                      {item.emoji || '📦'}
                    </div>
                    
                    {/* Name Input (Direct Edit) */}
                    <div className="flex-1 min-w-0">
                      <input 
                          type="text" 
                          value={item.name}
                          onChange={(e) => handleUpdateName(item.barcode, e.target.value)}
                          className="bg-transparent text-gray-100 font-medium w-full focus:bg-gray-700/50 rounded px-1 -ml-1 py-1 outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                          placeholder="Nom du produit"
                      />
                      <p className="text-xs text-gray-500 px-1 truncate">{item.barcode}</p>
                    </div>

                    {/* Details/Delete Button */}
                    <button 
                      onClick={() => { setActiveBarcode(item.barcode); setView(ViewState.PRODUCT_DETAILS); }}
                      className="text-gray-500 hover:text-blue-400 p-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>

                  {/* Stock Control Row */}
                  <div className="flex items-center justify-between bg-gray-900/50 rounded-lg p-1 pl-3">
                      <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Stock actuel</span>
                      
                      <div className="flex items-center gap-1">
                          <button 
                              onClick={() => handleUpdateStock(item.barcode, -1)}
                              className="w-10 h-9 flex items-center justify-center bg-gray-700 hover:bg-red-900/40 text-white hover:text-red-400 rounded-md transition active:scale-95"
                          >
                              -
                          </button>
                          
                          <div className={`w-14 text-center font-bold text-lg ${isLowStock ? 'text-red-500' : 'text-green-500'}`}>
                              {item.quantity}
                          </div>
                          
                          <button 
                              onClick={() => handleUpdateStock(item.barcode, 1)}
                              className="w-10 h-9 flex items-center justify-center bg-gray-700 hover:bg-green-900/40 text-white hover:text-green-400 rounded-md transition active:scale-95"
                          >
                              +
                          </button>
                      </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-gray-900 via-gray-900 to-transparent z-10">
        <div className="flex gap-3 max-w-md mx-auto">
          {/* Manual Entry Input */}
          <form onSubmit={handleManualSubmit} className="flex-1">
             <input
               type="text"
               inputMode="numeric"
               placeholder="Code-barres manuel..."
               value={manualBarcodeInput}
               onChange={(e) => setManualBarcodeInput(e.target.value)}
               className="w-full h-14 bg-gray-800 border border-gray-600 rounded-xl px-4 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 outline-none shadow-xl"
             />
          </form>
          
          {/* Scan Button */}
          <button
            onClick={() => {
               if (!apiKey) {
                 setShowSettings(true);
                 alert("Veuillez d'abord renseigner votre clé API Gemini.");
               } else {
                 setView(ViewState.SCANNER);
               }
            }}
            className="h-14 w-14 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 transition transform active:scale-95"
            aria-label="Scanner"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;