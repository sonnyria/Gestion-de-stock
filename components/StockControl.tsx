import React, { useState } from 'react';
import { Product } from '../types.ts';

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
      // Reset confirmation state after 3 seconds if user doesn't confirm
      setTimeout(() => setIsConfirming(false), 3000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white p-6 animate-fade-in">
      <button onClick={onClose} className="mb-6 text-gray-400 hover:text-white flex items-center gap-2">
        ← Retour
      </button>
      
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{product.emoji || '📦'}</span>
            <h2 className="text-3xl font-bold leading-tight">{product.name}</h2>
          </div>
          {/* Category display removed */}
        </div>
        <div className="text-right">
           <p className="text-xs text-gray-500 font-mono">REF</p>
           <p className="text-sm font-mono text-blue-400">{product.barcode}</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 bg-gray-800/50 rounded-2xl p-8 border border-gray-800">
        <p className="text-gray-400 text-sm uppercase tracking-widest mb-4">En Stock</p>
        
        <div className="text-8xl font-bold text-white mb-8 tabular-nums">
          {product.quantity}
        </div>

        <div className="flex items-center gap-6 w-full max-w-xs">
          <button
            onClick={() => onUpdateStock(product.barcode, -1)}
            className="flex-1 h-20 rounded-xl bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-500 text-4xl flex items-center justify-center transition active:scale-95"
          >
            -
          </button>
          <button
            onClick={() => onUpdateStock(product.barcode, 1)}
            className="flex-1 h-20 rounded-xl bg-green-900/20 hover:bg-green-900/40 border border-green-900/50 text-green-500 text-4xl flex items-center justify-center transition active:scale-95"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-auto pt-8">
        <button
          onClick={handleDeleteClick}
          className={`w-full py-4 rounded-xl text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
             isConfirming 
             ? 'bg-red-600 text-white shadow-lg hover:bg-red-700 scale-105 ring-2 ring-red-500 ring-offset-2 ring-offset-gray-900' 
             : 'bg-red-900/10 text-red-400 hover:bg-red-900/20 border border-red-900/30'
          }`}
        >
          {isConfirming ? (
              <>
                <span>⚠️ Confirmer la suppression ?</span>
              </>
          ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Supprimer du catalogue
              </>
          )}
        </button>
        {isConfirming && (
            <p className="text-center text-xs text-gray-500 mt-2 animate-pulse">Cliquez à nouveau pour valider</p>
        )}
      </div>
    </div>
  );
};

export default StockControl;