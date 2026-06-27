import { CheckCircle, Clock, MapPin, X } from 'lucide-react';

interface OrderSuccessProps {
  orderNumber: string;
  total: number;
  onClose: () => void;
}

export function OrderSuccess({ orderNumber, total, onClose }: OrderSuccessProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-sm w-full p-8 text-center relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        {/* Success icon */}
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle size={48} className="text-dhaba-green" />
          </div>
        </div>

        <h2 className="text-2xl font-black text-dhaba-dark mb-2">Order Placed!</h2>
        <p className="text-gray-500 mb-6">
          Your delicious food is being prepared with love and bold spices.
        </p>

        {/* Order details */}
        <div className="bg-dhaba-cream rounded-2xl p-4 mb-6 space-y-3 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Order #</span>
            <span className="font-bold text-dhaba-dark">{orderNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Paid</span>
            <span className="font-black text-dhaba-red text-lg">€{total.toFixed(2)}</span>
          </div>
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock size={14} className="text-dhaba-orange flex-none" />
              <span>Estimated ready: <strong>15–20 minutes</strong></span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={14} className="text-dhaba-orange flex-none" />
              <span>Pick up at <strong>DHABA Kiosk, Tallinn</strong></span>
            </div>
          </div>
        </div>

        <div className="text-4xl mb-4">🎉</div>
        <p className="text-sm text-gray-400">Thank you for choosing DHABA Tallinn!</p>

        <button
          onClick={onClose}
          className="mt-4 w-full bg-dhaba-red hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors"
        >
          Back to Menu
        </button>
      </div>
    </div>
  );
}
