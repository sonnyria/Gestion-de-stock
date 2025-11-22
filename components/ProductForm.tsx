import React, { useState, useEffect } from 'react';
import { Product, ProductEnhancement } from '../types.ts';
import { enhanceProductInfo } from '../services/geminiService.ts';

interface ProductFormProps {
  barcode: string;
  onSave: (product: Product) => void;
  onCancel: () => void;
}

const ProductForm: React.FC<ProductFormProps> = ({ barcode, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('Divers'); // Kept internally for data consistency but hidden
  const [emoji, setEmoji] = useState('📦');
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Auto-enhance when name changes significantly (debounced ideally, but simplified for button trigger here)
  const handleAIEnhance = async () => {
    if (name.length < 3) return;
    setIsLoadingAI(true);
    try {
      const info: ProductEnhancement = await enhanceProductInfo(name);
      setCategory(info.category);
      setEmoji(info.emoji);
      if (info.suggestedName) setName(info.suggestedName);
    } catch (e) {
      console.error("AI Enhancement failed", e);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newProduct: Product = {
      barcode,
      name,
      quantity,
      category,
      emoji,
      lastUpdated: Date.now()
    };
    onSave(newProduct);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6 animate-fade-in-up">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <span className="bg-green-600 rounded p-1 text-lg">🆕</span> Nouveau Produit
      </h2>
      
      <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700">
        <p className="text-gray-400 text-sm uppercase tracking-wider mb-1">Code-barres</p>
        <p className="text-2xl font-mono text-blue-400 tracking-widest">{barcode}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Nom du produit</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Nutella 500g"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none transition"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAIEnhance}
              disabled={isLoadingAI || name.length < 3}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white p-3 rounded-lg transition"
              title="Compléter avec IA"
            >
              {isLoadingAI ? '✨...' : '✨ IA'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Utilisez le bouton IA pour suggérer une icône.</p>
        </div>

        <div className="flex gap-4">
             <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1">Icône</label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-center text-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1">Stock Initial</label>
              <div className="flex items-center justify-between bg-gray-800 rounded-lg border border-gray-700 p-1 w-full h-[52px]">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(0, quantity - 1))}
                  className="w-10 h-full flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded"
                >
                  -
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  className="w-12 text-center bg-transparent font-bold outline-none appearance-none"
                />
                 <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-full flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded"
                >
                  +
                </button>
              </div>
            </div>
        </div>

        <div className="flex-1"></div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-medium transition"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!name}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-bold transition shadow-lg shadow-blue-900/20"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProductForm;