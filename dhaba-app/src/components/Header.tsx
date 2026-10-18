import { ShoppingCart, MapPin, Clock } from 'lucide-react';
import { useCart } from '../context/CartContext';

interface HeaderProps {
  onCartClick: () => void;
}

export function Header({ onCartClick }: HeaderProps) {
  const { itemCount, total } = useCart();

  return (
    <header className="bg-dhaba-dark sticky top-0 z-50 shadow-lg">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-dhaba-red text-white font-black text-xl px-3 py-1 rounded-lg tracking-widest">
              DHABA
            </div>
            <div className="hidden sm:block">
              <p className="text-white font-semibold text-sm leading-none">Tallinn</p>
              <p className="text-dhaba-orange text-xs">Asian Fusion Street Food</p>
            </div>
          </div>

          {/* Info */}
          <div className="hidden md:flex items-center gap-6 text-gray-400 text-sm">
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-dhaba-orange" />
              <span>Tallinn, Estonia</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-dhaba-orange" />
              <span>Mon–Fri 11:00–20:00</span>
            </div>
          </div>

          {/* Cart Button */}
          <button
            onClick={onCartClick}
            className="relative flex items-center gap-2 bg-dhaba-red hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold transition-colors"
          >
            <ShoppingCart size={18} />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <>
                <span className="hidden sm:inline text-dhaba-gold font-bold">
                  €{total.toFixed(2)}
                </span>
                <span className="absolute -top-2 -right-2 bg-dhaba-gold text-dhaba-dark text-xs font-black w-5 h-5 rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
