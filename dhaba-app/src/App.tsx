import { useState, useMemo } from 'react';
import { CartProvider, useCart } from './context/CartContext';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { CategoryFilter } from './components/CategoryFilter';
import { MenuCard } from './components/MenuCard';
import { Cart } from './components/Cart';
import { OrderSuccess } from './components/OrderSuccess';
import { Footer } from './components/Footer';
import { categories, menuItems } from './data/menu';
import { Search } from 'lucide-react';

function AppInner() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ number: string; total: number } | null>(null);
  const { total, clearCart } = useCart();

  const filtered = useMemo(() => {
    return menuItems.filter(item => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tags.some(t => t.includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const handleCheckout = () => {
    const orderNum = `DH-${Date.now().toString().slice(-6)}`;
    const orderTotal = total;
    clearCart();
    setCartOpen(false);
    setOrderSuccess({ number: orderNum, total: orderTotal });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header onCartClick={() => setCartOpen(true)} />
      <Hero />

      {/* Menu Section */}
      <div id="menu">
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Search bar */}
          <div className="relative mb-8 max-w-md mx-auto">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-gray-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-dhaba-red/30 focus:border-dhaba-red text-sm"
            />
          </div>

          {/* Section heading */}
          {selectedCategory !== 'all' && (
            <div className="mb-6">
              {(() => {
                const cat = categories.find(c => c.id === selectedCategory);
                return cat ? (
                  <div>
                    <h2 className="text-2xl font-black text-dhaba-dark flex items-center gap-2">
                      <span>{cat.emoji}</span>
                      {cat.name}
                    </h2>
                    <p className="text-gray-500 text-sm mt-0.5">{cat.description}</p>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-5xl mb-3">🔍</p>
              <p className="text-lg font-medium">No items found</p>
              <p className="text-sm mt-1">Try a different search or category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(item => (
                <MenuCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />

      <Cart
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={handleCheckout}
      />

      {orderSuccess && (
        <OrderSuccess
          orderNumber={orderSuccess.number}
          total={orderSuccess.total}
          onClose={() => setOrderSuccess(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <CartProvider>
      <AppInner />
    </CartProvider>
  );
}
