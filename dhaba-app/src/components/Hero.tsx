import { ChevronDown } from 'lucide-react';

export function Hero() {
  const scrollToMenu = () => {
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative bg-dhaba-dark overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            #C0392B 0px,
            #C0392B 2px,
            transparent 2px,
            transparent 30px
          )`
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-20 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-dhaba-red/20 border border-dhaba-red/40 text-dhaba-orange text-sm font-medium px-4 py-1.5 rounded-full mb-6">
          <span className="w-2 h-2 rounded-full bg-dhaba-orange animate-pulse" />
          Bold Flavors. Fresh Experience.
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-white mb-4 leading-none">
          DHABA
          <span className="block text-dhaba-red">Tallinn</span>
        </h1>

        <p className="text-xl text-gray-300 mb-3 max-w-xl mx-auto">
          Asian Fusion Street Food
        </p>
        <p className="text-gray-500 mb-10 max-w-lg mx-auto">
          From savory kebabs and tacos to rice bowls and crispy fries —
          authentic Indian spices meet modern culinary innovation.
        </p>

        {/* Stats */}
        <div className="flex justify-center gap-8 mb-10">
          {[
            { value: '25+', label: 'Menu Items' },
            { value: '100%', label: 'Fresh Daily' },
            { value: '🌱', label: 'Vegan Options' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-3xl font-black text-dhaba-orange">{value}</div>
              <div className="text-gray-400 text-sm">{label}</div>
            </div>
          ))}
        </div>

        <button
          onClick={scrollToMenu}
          className="inline-flex items-center gap-2 bg-dhaba-red hover:bg-red-700 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105 active:scale-95"
        >
          View Menu
          <ChevronDown size={20} />
        </button>
      </div>
    </div>
  );
}
