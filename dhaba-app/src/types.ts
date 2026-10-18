export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  tags: string[];
  popular?: boolean;
  vegan?: boolean;
  spicy?: boolean;
  emoji: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export type Category = {
  id: string;
  name: string;
  emoji: string;
  description: string;
};
