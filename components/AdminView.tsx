import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../types';
import { PlusCircle, Loader2, CheckCircle2, PackagePlus } from 'lucide-react';

interface AdminViewProps {
  items: InventoryItem[];
  onAdd: (name: string, stock: number, threshold: number, details: Record<string, any>) => Promise<boolean>;
}

export const AdminView: React.FC<AdminViewProps> = ({ items, onAdd }) => {
  // ETAT AJOUT
  const [newName, setNewName] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [newThreshold, setNewThreshold] = useState('0');
  const [dynamicFields, setDynamicFields] = useState<Record<string, string>>({});
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Détection des colonnes disponibles
  useEffect(() => {
    if (items.length > 0) {
        const allKeys = new Set<string>();
        items.forEach(item => {
            if (item.details) {
                Object.keys(item.details).forEach(k => allKeys.add(k));
            }
        });
        const specialColumns = ["nom de l'article", "stock", "seuil", "alerte", "min", "limite"];
        const filtered = Array.from(allKeys).filter(key => 
            !specialColumns.includes(key.toLowerCase())
        );
        setAvailableColumns(filtered);
    }
  }, [items]);

  const handleDynamicFieldChange = (key: string, value: string) => {
      setDynamicFields(prev => ({ ...prev, [key]: value }));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    setIsSubmitting(true);
    const success = await onAdd(newName, parseInt(newStock) || 0, parseInt(newThreshold) || 0, dynamicFields);
    setIsSubmitting(false);

    if (success) {
      setNewName('');
      setNewStock('0');
      setNewThreshold('0');
      setDynamicFields({});
      alert("Article ajouté avec succès !");
    } else {
      alert("Erreur lors de l'ajout (Vérifiez le script ou doublons).");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4">
      
      {/* SECTION AJOUTER */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50">
        <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-5">
            <div className="bg-orange-100 p-3 rounded-full">
                <PackagePlus className="text-orange-600" size={28} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Nouvelle Référence</h2>
                <p className="text-slate-500 text-sm">Ajoutez un nouvel article à votre inventaire</p>
            </div>
        </div>

        <form onSubmit={handleAdd} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Nom de l'article <span className="text-orange-500">*</span></label>
                    <input 
                        type="text" 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full px-4 py-3.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500 outline-none shadow-sm text-slate-900 font-medium placeholder:text-slate-300 transition-all"
                        placeholder="Ex: Stylo Bleu"
                        style={{ backgroundColor: '#ffffff', color: '#000000' }}
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Stock Initial</label>
                    <input 
                        type="number" 
                        value={newStock}
                        onChange={(e) => setNewStock(e.target.value)}
                        className="w-full px-4 py-3.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500 outline-none shadow-sm text-slate-900 font-bold"
                        style={{ backgroundColor: '#ffffff', color: '#000000' }}
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">Seuil d'alerte</label>
                    <input 
                        type="number" 
                        value={newThreshold}
                        onChange={(e) => setNewThreshold(e.target.value)}
                        className="w-full px-4 py-3.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500 outline-none shadow-sm text-slate-900 font-bold"
                        style={{ backgroundColor: '#ffffff', color: '#000000' }}
                    />
                </div>
            </div>

            {availableColumns.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 mt-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                        Détails supplémentaires
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {availableColumns.map(colName => (
                            <div key={colName}>
                                <label className="block text-xs font-bold text-slate-500 mb-1.5 capitalize truncate">{colName}</label>
                                <input 
                                    type="text" 
                                    value={dynamicFields[colName] || ''}
                                    onChange={(e) => handleDynamicFieldChange(colName, e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-slate-900 shadow-sm transition-all"
                                    placeholder={`...`}
                                    style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <button 
                type="submit" 
                disabled={isSubmitting || !newName}
                className="w-full py-4 bg-orange-600 text-white font-bold text-lg rounded-xl hover:bg-orange-700 transition-all disabled:opacity-50 flex justify-center items-center gap-3 shadow-lg shadow-orange-200 hover:shadow-orange-300 hover:-translate-y-0.5 mt-8"
            >
                {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                Créer la référence
            </button>
        </form>
      </div>
    </div>
  );
};