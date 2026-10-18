import { Share2, Mail, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-dhaba-dark border-t border-white/10 py-10 mt-16">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-dhaba-red text-white font-black text-lg px-2.5 py-0.5 rounded-lg tracking-widest">
                DHABA
              </div>
              <span className="text-white font-semibold">Tallinn</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Asian Fusion Street Food. Bold flavors, fresh ingredients, authentic spices —
              reimagined for Tallinn.
            </p>
          </div>

          {/* Hours */}
          <div>
            <h4 className="text-white font-bold mb-3">Opening Hours</h4>
            <div className="space-y-1 text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Monday – Friday</span>
                <span>11:00 – 20:00</span>
              </div>
              <div className="flex justify-between">
                <span>Saturday</span>
                <span>12:00 – 21:00</span>
              </div>
              <div className="flex justify-between">
                <span>Sunday</span>
                <span className="text-red-400">Closed</span>
              </div>
            </div>
          </div>

          {/* Contact & Delivery */}
          <div>
            <h4 className="text-white font-bold mb-3">Also Available On</h4>
            <div className="space-y-2 text-sm text-gray-400 mb-4">
              <p>🛫 Wolt — Fast delivery</p>
              <p>🚗 Bolt Food — Quick delivery</p>
            </div>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/dhaba_tallinn" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-gray-400 hover:text-dhaba-orange transition-colors text-sm">
                <ExternalLink size={14} />Instagram
              </a>
              <a href="https://www.facebook.com/DhabaTallinn" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-gray-400 hover:text-dhaba-orange transition-colors text-sm">
                <Share2 size={14} />Facebook
              </a>
              <a href="mailto:info@dhaba-tallinn.ee"
                className="text-gray-400 hover:text-dhaba-orange transition-colors">
                <Mail size={20} />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-center text-gray-500 text-xs">
          © 2025 DHABA Tallinn — Asian Fusion Street Food Kiosk | Authentic Flavors, Modern Taste
        </div>
      </div>
    </footer>
  );
}
