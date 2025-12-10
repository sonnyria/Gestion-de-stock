import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../types';
import { Loader2, Minus, Plus, Box, Bell, BellRing, Save, X, Info, Pencil, Trash2, AlertTriangle, AlertOctagon } from 'lucide-react';

interface InventoryCardProps {
  item: InventoryItem;
  onUpdate: (name: string, newStock: number) => Promise<void>;
  onUpdateThreshold: (name: string, newThreshold: number) => Promise<void>;
  onUpdateDetails?: (name: string, updates: Record<string, any>) => Promise<void>;
  onDelete: (name: string) => Promise<boolean>;
}

export const InventoryCard: React.FC<InventoryCardProps> = ({ item, onUpdate, onUpdateThreshold, onUpdateDetails, onDelete }) => {
  const [amount, setAmount] = useState<string>('1');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // CONVERSION STRICTE DES DONNÉES
  const currentStock = typeof item.stock === 'number' ? item.stock : parseFloat(String(item.stock || '0'));
  const currentThreshold = typeof item.threshold === 'number' ? item.threshold : parseFloat(String(item.threshold || '0'));
  
  // LOGIQUE ALARME
  const isLowStock = currentThreshold > 0 && currentStock <= currentThreshold;

  // Gestion du mode édition du seuil
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState(String(currentThreshold));
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  // Synchronisation
  useEffect(() => {
    setThresholdInput(String(currentThreshold));
  }, [currentThreshold]);

  // Gestion de la modale de détails
  const [showDetails, setShowDetails] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState<Record<string, any>>({});
  const [editedName, setEditedName] = useState(item.name);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Gestion suppression
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openDetails = () => {
      setDetailsForm(item.details || {});
      setEditedName(item.name);
      setIsEditingDetails(false);
      setConfirmDelete(false); 
      setShowDetails(true);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      setAmount(val);
    }
  };

  const updateStock = async (operation: 'add' | 'remove') => {
    if (!amount) return;
    const qty = parseInt(amount, 10);
    if (isNaN(qty) || qty <= 0) return;

    setIsUpdating(true);
    let newTotal = currentStock;
    if (operation === 'add') {
      newTotal = currentStock + qty;
    } else {
      newTotal = Math.max(0, currentStock - qty);
    }
    
    await onUpdate(item.name, newTotal);
    setIsUpdating(false);
  };

  const handleSaveThreshold = async () => {
    const val = parseInt(thresholdInput, 10);
    if (!isNaN(val)) {
        setIsSavingThreshold(true);
        await onUpdateThreshold(item.name, val);
        setIsSavingThreshold(false);
        setIsEditingThreshold(false);
    }
  };

  const handleSaveDetails = async () => {
      if (onUpdateDetails) {
          setIsSavingDetails(true);
          const updates = { ...detailsForm };
          if (editedName.trim() !== item.name) {
              updates['_newName'] = editedName.trim();
          }
          await onUpdateDetails(item.name, updates);
          setIsSavingDetails(false);
          setIsEditingDetails(false);
      }
  };

  const handleDeleteClick = async () => {
      if (!confirmDelete) {
          setConfirmDelete(true);
          setTimeout(() => setConfirmDelete(false), 4000);
          return;
      }
      setIsDeleting(true);
      const success = await onDelete(item.name);
      if (success) {
          setShowDetails(false);
      } else {
          setIsDeleting(false);
          setConfirmDelete(false);
      }
  };

  const handleDetailChange = (key: string, value: string) => {
      setDetailsForm(prev => ({ ...prev, [key]: value }));
  };

  // STYLE DYNAMIQUE PRO
  // Rouge léger pour l'alarme, Blanc pur sinon.
  // Bordure plus marquée si alerte.
  const containerStyle = isLowStock 
    ? { backgroundColor: '#FEF2F2', borderColor: '#EF4444', borderWidth: '2px' } 
    : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: '1px' };

  return (
    <>
      <div 
        className="rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 p-5 flex flex-col h-full relative overflow-hidden group"
        style={containerStyle}
      >
        {isLowStock && (
            <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-lg z-10 shadow-sm tracking-wide">
                CRITIQUE
            </div>
        )}

        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-start gap-3 flex-1 min-w-0">
              <div 
                className={`p-2.5 rounded-xl shrink-0 flex items-center justify-center h-12 w-12 shadow-sm ${isLowStock ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-600'}`}
              >
                {isLowStock ? <AlertOctagon size={26} strokeWidth={2.5} /> : <Box size={26} strokeWidth={1.5} />}
              </div>
              <div className="min-w-0 pt-0.5">
                <h3 className="font-bold text-slate-900 leading-tight text-lg break-words">{item.name}</h3>
                {isLowStock ? (
                    <p className="text-sm font-bold text-red-600 mt-1 flex items-center gap-1">
                       <AlertTriangle size={14} /> Stock: {currentStock} (Min: {currentThreshold})
                    </p>
                ) : (
                    currentThreshold > 0 && (
                        <p className="text-xs font-semibold text-slate-400 mt-1 bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-100">Min : {currentThreshold}</p>
                    )
                )}
              </div>
          </div>

          <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={openDetails}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Détails"
            >
                <Info size={18} />
            </button>
            <button 
                onClick={() => setIsEditingThreshold(!isEditingThreshold)}
                className={`p-1.5 rounded-lg transition-colors ${currentThreshold > 0 ? 'text-orange-600 bg-orange-50' : 'text-slate-400 hover:text-orange-600 hover:bg-orange-50'}`}
                title="Alerte"
            >
                {currentThreshold > 0 ? <BellRing size={18} /> : <Bell size={18} />}
            </button>
          </div>
        </div>

        {/* Configuration Seuil */}
        {isEditingThreshold && (
            <div className="mb-5 bg-white p-3 rounded-lg border border-orange-200 shadow-md animate-in fade-in slide-in-from-top-2 relative z-20">
                <label className="text-[10px] font-bold text-orange-600 uppercase block mb-1 tracking-wider">Seuil d'alerte</label>
                <div className="flex gap-2">
                    <input 
                      type="number" 
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      className="w-20 px-2 py-2 text-lg font-bold text-center text-slate-900 border border-slate-200 rounded focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                      style={{ backgroundColor: '#ffffff', color: '#000000' }}
                      autoFocus
                    />
                    <button 
                      onClick={handleSaveThreshold}
                      disabled={isSavingThreshold}
                      className="flex-1 bg-orange-600 text-white font-bold px-3 py-2 rounded hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-1 shadow-sm"
                    >
                        {isSavingThreshold ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                        <span className="text-sm">Sauver</span>
                    </button>
                </div>
            </div>
        )}

        <div className="mt-auto">
          {/* Badge Stock Principal */}
          <div className="flex items-end justify-between mb-3 px-1">
              <span className="text-xs font-bold text-slate-400 uppercase pb-1 tracking-wide">Disponible</span>
              <div className={`px-4 py-1.5 rounded-lg text-2xl font-bold border leading-none ${isLowStock ? 'bg-red-600 text-white border-red-700 shadow-md' : 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200'}`}>
                  {currentStock}
              </div>
          </div>

          <div className="space-y-3">
              <div className="relative">
                  <input 
                      type="number" 
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={amount}
                      onChange={handleAmountChange}
                      disabled={isUpdating}
                      style={{ backgroundColor: '#ffffff', color: '#000000' }} 
                      className="w-full text-center py-3 px-3 border border-slate-200 rounded-xl text-lg font-bold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none shadow-inner"
                      placeholder="Qté..."
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-black tracking-widest pointer-events-none">UNITÉS</span>
              </div>
              <div className="flex gap-3 h-12">
                  <button 
                      onClick={() => updateStock('remove')}
                      disabled={isUpdating || !amount || parseInt(amount) === 0}
                      className="flex-1 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl flex items-center justify-center gap-1 font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                  >
                      {isUpdating ? <Loader2 className="animate-spin" size={20} /> : <Minus size={22} strokeWidth={3} />}
                  </button>
                  <button 
                      onClick={() => updateStock('add')}
                      disabled={isUpdating || !amount || parseInt(amount) === 0}
                      className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 hover:border-orange-300 rounded-xl flex items-center justify-center gap-1 font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                  >
                      {isUpdating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={22} strokeWidth={3} />}
                  </button>
              </div>
          </div>
        </div>
      </div>

      {/* MODALE DÉTAILS - PRO */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
               <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                 <div className="flex-1 mr-4">
                    {isEditingDetails ? (
                        <input 
                            type="text" 
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            className="w-full text-xl font-bold border-b-2 border-orange-500 outline-none pb-1 bg-transparent text-slate-900"
                        />
                    ) : (
                        <h3 className="font-bold text-2xl text-slate-900">{item.name}</h3>
                    )}
                 </div>
                 <button onClick={() => setShowDetails(false)} className="p-2 bg-white border border-slate-200 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-900 transition-colors">
                    <X size={20} />
                 </button>
               </div>
               
               <div className="overflow-y-auto p-6 space-y-5 bg-white flex-1">
                 {isEditingDetails ? (
                    <div className="space-y-4">
                        {Object.entries(detailsForm).map(([key, val], idx) => {
                            if (["nom de l'article", "stock", "seuil"].includes(key.toLowerCase())) return null;
                            return (
                                <div key={idx}>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">{key}</label>
                                    <input 
                                        type="text" 
                                        value={val as string}
                                        onChange={(e) => handleDetailChange(key, e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-lg font-medium text-slate-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                                        style={{ backgroundColor: '#ffffff' }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                 ) : (
                    <div className="space-y-0 divide-y divide-slate-100">
                         {item.details && Object.entries(item.details).map(([key, val], idx) => (
                             val ? (
                                <div key={idx} className="flex justify-between py-3">
                                    <span className="text-sm text-slate-500 font-semibold uppercase tracking-tight">{key}</span>
                                    <span className="text-sm text-slate-900 font-bold text-right pl-4">{String(val)}</span>
                                </div>
                             ) : null
                         ))}
                    </div>
                 )}
               </div>

               <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                   {!isEditingDetails && (
                       <button
                           onClick={handleDeleteClick}
                           className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold transition-all text-sm ${confirmDelete ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'text-red-600 hover:bg-red-50'}`}
                       >
                           {isDeleting ? <Loader2 size={16} className="animate-spin" /> : confirmDelete ? <AlertTriangle size={16} /> : <Trash2 size={16} />}
                           {confirmDelete ? "CONFIRMER SUPPRESSION ?" : "Supprimer"}
                       </button>
                   )}
                   
                   <div className="flex gap-3 ml-auto">
                        {isEditingDetails ? (
                           <>
                            <button onClick={() => setIsEditingDetails(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Annuler</button>
                            <button onClick={handleSaveDetails} className="px-5 py-2.5 bg-orange-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-orange-700 shadow-md">
                                {isSavingDetails ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} Enregistrer
                            </button>
                           </>
                        ) : (
                            <>
                            <button onClick={() => setIsEditingDetails(true)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-bold hover:bg-slate-50 flex items-center gap-2 shadow-sm">
                                <Pencil size={16}/> Modifier
                            </button>
                            <button onClick={() => setShowDetails(false)} className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 shadow-lg shadow-slate-300">OK</button>
                            </>
                        )}
                   </div>
               </div>
            </div>
        </div>
      )}
    </>
  );
};