import type { Category } from '../types';
import { menuItems } from '../data/menu';

interface CategoryFilterProps {
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}

export function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
  const counts: Record<string, number> = { all: menuItems.length };
  menuItems.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  return (
    <div className="sticky top-16 z-40 bg-dhaba-dark/95 backdrop-blur border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex gap-2 py-3 overflow-x-auto scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`flex-none flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                selected === cat.id
                  ? 'bg-dhaba-red text-white shadow-lg'
                  : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                selected === cat.id ? 'bg-red-700 text-white' : 'bg-white/10 text-gray-400'
              }`}>
                {counts[cat.id] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
