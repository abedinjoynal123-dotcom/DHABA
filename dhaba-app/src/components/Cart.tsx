import { X, Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export function Cart({ isOpen, onClose, onCheckout }: CartProps) {
  const { items, removeItem, updateQty, total, itemCount, clearCart } = useCart();

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-2xl transform transition-transform duration-300 flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-dhaba-dark">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-dhaba-orange" size={22} />
            <h2 className="text-white font-bold text-lg">Your Order</h2>
            {itemCount > 0 && (
              <span className="bg-dhaba-red text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {itemCount} items
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-16">
              <ShoppingBag size={56} className="mb-4 opacity-30" />
              <p className="text-lg font-medium">Your cart is empty</p>
              <p className="text-sm mt-1">Add some delicious items from the menu!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                  <span className="text-3xl flex-none">{item.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-dhaba-dark text-sm leading-tight truncate">
                      {item.name}
                    </p>
                    <p className="text-dhaba-red font-bold text-sm">€{item.price.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-none">
                    <button
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-full bg-white border hover:bg-gray-100 flex items-center justify-center transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-dhaba-dark w-5 text-center text-sm">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-full bg-dhaba-red hover:bg-red-700 text-white flex items-center justify-center transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="flex-none text-right">
                    <p className="font-bold text-dhaba-dark text-sm">
                      €{(item.price * item.quantity).toFixed(2)}
                    </p>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-gray-400 hover:text-red-500 mt-1 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t bg-white p-5 space-y-3">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal ({itemCount} items)</span>
              <span>€{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-black text-dhaba-dark text-xl">
              <span>Total</span>
              <span className="text-dhaba-red">€{total.toFixed(2)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full bg-dhaba-red hover:bg-red-700 text-white font-bold py-4 rounded-xl text-lg transition-all active:scale-95"
            >
              Place Order — €{total.toFixed(2)}
            </button>
            <button
              onClick={clearCart}
              className="w-full text-gray-400 hover:text-red-500 text-sm py-1 transition-colors"
            >
              Clear cart
            </button>
          </div>
        )}
      </div>
    </>
  );
}
