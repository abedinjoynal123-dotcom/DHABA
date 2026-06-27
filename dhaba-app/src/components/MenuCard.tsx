import { Plus, Minus, Flame, Leaf } from 'lucide-react';
import type { MenuItem } from '../types';
import { useCart } from '../context/CartContext';

interface MenuCardProps {
  item: MenuItem;
}

export function MenuCard({ item }: MenuCardProps) {
  const { items, addItem, updateQty } = useCart();
  const cartItem = items.find(i => i.id === item.id);
  const qty = cartItem?.quantity ?? 0;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group">
      {/* Image placeholder with emoji */}
      <div className="bg-gradient-to-br from-dhaba-cream to-orange-100 h-40 flex items-center justify-center relative overflow-hidden">
        <span className="text-7xl group-hover:scale-110 transition-transform duration-300">
          {item.emoji}
        </span>
        {item.popular && (
          <div className="absolute top-3 left-3 bg-dhaba-red text-white text-xs font-bold px-2 py-1 rounded-full">
            Popular
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-1">
          {item.vegan && (
            <div className="bg-dhaba-green text-white p-1 rounded-full" title="Vegan">
              <Leaf size={12} />
            </div>
          )}
          {item.spicy && (
            <div className="bg-dhaba-orange text-white p-1 rounded-full" title="Spicy">
              <Flame size={12} />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-dhaba-dark text-base leading-tight mb-1">
          {item.name}
        </h3>
        <p className="text-gray-500 text-sm leading-relaxed flex-1 mb-3 line-clamp-2">
          {item.description}
        </p>

        {/* Price & Add to cart */}
        <div className="flex items-center justify-between">
          <span className="text-dhaba-red font-black text-xl">
            €{item.price.toFixed(2)}
          </span>

          {qty === 0 ? (
            <button
              onClick={() => addItem(item)}
              className="flex items-center gap-1.5 bg-dhaba-red hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all active:scale-95"
            >
              <Plus size={16} />
              Add
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQty(item.id, qty - 1)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="font-bold text-dhaba-dark w-5 text-center">{qty}</span>
              <button
                onClick={() => addItem(item)}
                className="w-8 h-8 rounded-full bg-dhaba-red hover:bg-red-700 text-white flex items-center justify-center transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
