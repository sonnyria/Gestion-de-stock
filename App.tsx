import React, { useEffect, useState } from 'react';
import { fetchInventory, updateStock, updateThreshold, updateItemDetails, addArticle, deleteArticle, getScriptUrl, STORAGE_KEY_URL } from './services/sheetService';
import { InventoryItem } from './types';
import { InventoryCard } from './components/InventoryCard';
import { AdminView } from './components/AdminView';
import { PackageSearch, RefreshCw, AlertCircle, Search, X, LayoutGrid, PlusCircle, Loader2, Settings, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';

const App: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Navigation
  const [currentTab, setCurrentTab] = useState<'inventory' | 'admin' | 'alerts'>('inventory');
  const [searchTerm, setSearchTerm] = useState('');

  // Configuration
  const [showSettings, setShowSettings] = useState(false);
  const [configUrl, setConfigUrl] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rawData = await fetchInventory();
      // NETTOYAGE DES DONNÉES : Conversion forcée en float/int pour éviter les erreurs de type
      const cleanData = rawData.map(item => {
        // On nettoie les chaînes qui pourraient contenir des espaces ou être vides
        const stockStr = String(item.stock).replace(/\s/g, '');
        const thresholdStr = String(item.threshold || '0').replace(/\s/g, '');
        
        return {
          ...item,
          name: item.name,
          stock: stockStr === '' ? 0 : Number(stockStr),
          threshold: thresholdStr === '' ? 0 : Number(thresholdStr)
        };
      });
      setItems(cleanData);
    } catch (err: any) {
      console.error("App load error:", err);
      let message = err.message || "Erreur inconnue";
      if (message.includes("getDataRange") || message.includes("null")) {
        message = "Script obsolète. Veuillez redéployer une Nouvelle Version dans Apps Script.";
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openSettings = () => {
      setConfigUrl(getScriptUrl());
      setShowSettings(true);
  };

  const saveSettings = () => {
      if (configUrl.trim()) {
          localStorage.setItem(STORAGE_KEY_URL, configUrl.trim());
          setShowSettings(false);
          loadData(); // Recharger les données avec la nouvelle URL
      }
  };

  const handleUpdate = async (name: string, newStock: number) => {
    // Mise à jour optimiste locale immédiate
    setItems(prev => prev.map(item => 
      item.name === name ? { ...item, stock: newStock } : item
    ));
    const success = await updateStock(name, newStock);
    if (!success) loadData(); // Revert si échec
  };

  const handleUpdateThreshold = async (name: string, newThreshold: number) => {
    setItems(prev => prev.map(item => 
      item.name === name ? { ...item, threshold: newThreshold } : item
    ));
    const success = await updateThreshold(name, newThreshold);
    if (!success) alert("Erreur sauvegarde seuil");
  };

  const handleUpdateDetails = async (name: string, updates: Record<string, any>) => {
      const success = await updateItemDetails(name, updates);
      if (success) {
          setItems(prev => prev.map(item => {
              if (item.name === name) {
                  const updatedName = updates._newName || item.name;
                  const { _newName, ...cleanUpdates } = updates;
                  return { 
                      ...item, 
                      name: updatedName,
                      details: { ...item.details, ...cleanUpdates } 
                  };
              }
              return item;
          }));
      } else {
          alert("Erreur lors de la sauvegarde.");
          loadData();
      }
  };

  const handleAddArticle = async (name: string, stock: number, threshold: number, details: Record<string, any>) => {
      const success = await addArticle(name, stock, threshold, details);
      if (success) {
          await loadData(); 
          return true;
      }
      return false;
  };

  const handleDeleteArticle = async (name: string) => {
      try {
        const success = await deleteArticle(name);
        if (success) {
            setItems(prev => prev.filter(i => i.name !== name));
            return true;
        }
        return false;
      } catch (err: any) {
        alert("Erreur suppression: " + err.message);
        return false;
      }
  };

  // Logique de filtrage
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const alertItems = items.filter(item => {
    const s = typeof item.stock === 'number' ? item.stock : 0;
    const t = typeof item.threshold === 'number' ? item.threshold : 0;
    return t > 0 && s <= t;
  });

  const currentUrl = getScriptUrl();
  const isConfigured = currentUrl && !currentUrl.includes("PLACEHOLDER");

  return (
    <div className="min-h-screen bg-gray-100 pb-20 font-sans">
      {/* HEADER PRO : BLEU NUIT */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* ACCENT ORANGE */}
                    <div className="bg-orange-600 p-2 rounded-lg shadow-lg shadow-orange-900/20">
                        <PackageSearch className="text-white" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white leading-none hidden sm:block tracking-tight">GESTION STOCK</h1>
                        <h1 className="text-xl font-bold text-white leading-none sm:hidden">STOCK</h1>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={loadData} 
                        disabled={loading}
                        className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                        title="Rafraîchir"
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin text-orange-500" : ""} />
                    </button>
                    <button 
                        onClick={openSettings} 
                        className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                        title="Configuration"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            {/* ONGLETS MODERNES */}
            <div className="flex gap-8 mt-2 overflow-x-auto">
                <button 
                    onClick={() => setCurrentTab('inventory')}
                    className={`pb-3 text-sm font-bold border-b-[3px] transition-all flex items-center gap-2 whitespace-nowrap ${currentTab === 'inventory' ? 'border-orange-500 text-orange-500' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    <LayoutGrid size={18} />
                    INVENTAIRE
                </button>
                <button 
                    onClick={() => setCurrentTab('alerts')}
                    className={`pb-3 text-sm font-bold border-b-[3px] transition-all flex items-center gap-2 whitespace-nowrap ${currentTab === 'alerts' ? 'border-red-500 text-red-500' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    <AlertTriangle size={18} />
                    ALERTES
                    {alertItems.length > 0 && (
                        <span className="bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1">
                            {alertItems.length}
                        </span>
                    )}
                </button>
                <button 
                    onClick={() => setCurrentTab('admin')}
                    className={`pb-3 text-sm font-bold border-b-[3px] transition-all flex items-center gap-2 whitespace-nowrap ${currentTab === 'admin' ? 'border-orange-500 text-orange-500' : 'border-transparent text-slate-400 hover:text-white'}`}
                >
                    <PlusCircle size={18} />
                    AJOUT DE RÉFÉRENCE
                </button>
            </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isConfigured && (
           <div className="mb-8 bg-slate-800 border-l-4 border-orange-500 rounded-r-lg p-6 flex items-start gap-4 shadow-lg">
             <Settings className="text-orange-500 flex-shrink-0 mt-1" size={24} />
             <div>
               <h3 className="font-bold text-white text-lg">Configuration requise</h3>
               <p className="text-slate-300 mt-1">Cliquez sur l'icône d'engrenage en haut à droite pour entrer l'URL de votre Script Google.</p>
             </div>
           </div>
        )}

        {error && (
            <div className="mb-6 bg-red-50 text-red-900 p-6 rounded-xl border border-red-200 shadow-sm flex items-start gap-4">
                <AlertCircle className="text-red-600 shrink-0" size={28} />
                <div>
                    <h3 className="font-bold text-lg mb-1">Erreur de connexion</h3>
                    <p className="text-sm font-medium mb-3">{error}</p>
                    <button onClick={loadData} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors">Réessayer</button>
                </div>
            </div>
        )}

        {currentTab === 'inventory' && (
            <>
                <div className="mb-8">
                    <div className="relative group max-w-xl mx-auto md:mx-0">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        </div>
                        <input
                        type="text"
                        placeholder="Rechercher une référence..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-11 py-3.5 rounded-xl border-0 shadow-md ring-1 ring-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-base font-medium text-slate-900 transition-all"
                        style={{ backgroundColor: '#ffffff' }}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600">
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Loader2 className="animate-spin mb-4 text-orange-500" size={40} />
                        <p className="font-medium text-slate-500">Chargement des données...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredItems.map((item, index) => (
                        <InventoryCard 
                            key={`${item.name}-${index}`} 
                            item={item} 
                            onUpdate={handleUpdate}
                            onUpdateThreshold={handleUpdateThreshold}
                            onUpdateDetails={handleUpdateDetails}
                            onDelete={handleDeleteArticle}
                        />
                        ))}
                    </div>
                )}
            </>
        )}
        
        {currentTab === 'alerts' && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
                 <div className="mb-6 flex items-center gap-3">
                    <div className="bg-red-100 p-2 rounded-full">
                        <AlertTriangle className="text-red-600" size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Articles Critiques</h2>
                        <p className="text-slate-500 text-sm">Liste des produits nécessitant un réapprovisionnement</p>
                    </div>
                </div>

                {alertItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="bg-green-100 p-4 rounded-full mb-4">
                            <CheckCircle2 className="text-green-600" size={48} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Tout est sous contrôle !</h3>
                        <p className="text-slate-500">Aucun article n'a atteint son seuil d'alerte.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {alertItems.map((item, index) => (
                            <InventoryCard 
                                key={`alert-${item.name}-${index}`} 
                                item={item} 
                                onUpdate={handleUpdate}
                                onUpdateThreshold={handleUpdateThreshold}
                                onUpdateDetails={handleUpdateDetails}
                                onDelete={handleDeleteArticle}
                            />
                        ))}
                    </div>
                )}
            </div>
        )}

        {currentTab === 'admin' && (
            <AdminView items={items} onAdd={handleAddArticle} />
        )}
      </main>

      {/* MODALE PARAMÈTRES - STYLE PRO */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-0 overflow-hidden">
                <div className="bg-slate-900 p-6 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        <Settings className="text-orange-500" />
                        Configuration Système
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-6">
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">URL du Script Google Web App</label>
                        <textarea 
                            value={configUrl}
                            onChange={(e) => setConfigUrl(e.target.value)}
                            className="w-full h-32 px-4 py-3 border border-slate-200 bg-slate-50 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-sm font-mono text-slate-800 resize-none shadow-inner"
                            placeholder="https://script.google.com/macros/s/..."
                            style={{ backgroundColor: '#F8FAFC' }}
                        />
                        <p className="text-xs text-slate-500 mt-3 flex items-center gap-2">
                           <InfoIconMini /> Collez ici l'URL de déploiement de votre script Apps Script.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Annuler
                        </button>
                        <button 
                            onClick={saveSettings}
                            className="px-5 py-2.5 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 flex items-center gap-2 shadow-lg shadow-orange-200 transition-all hover:translate-y-px"
                        >
                            <Save size={18} />
                            Enregistrer
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// Petit composant helper pour l'icone info
const InfoIconMini = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
);

export default App;