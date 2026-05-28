// Static placeholder data for the frontend scaffold.
// Replace with Supabase queries once the backend is wired up.

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  discountPrice?: number;
  currency: string;
  category: string;
  color?: string;
  condition: "new" | "used";
  availability: "in_stock" | "out_of_stock";
  keywords: string[];
  image: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerLocation: string;
  productTitle: string;
  quantity: number;
  deliveryCompany: string;
  status: "new" | "merchant_notified" | "delivery_notified" | "completed" | "cancelled";
  createdAt: string;
}

export interface MerchantProfile {
  storeName: string;
  whatsapp: string;
  bio: string;
  city: string;
  category: string;
  deliveryName: string;
  deliveryPhone: string;
  active: boolean;
  logo?: string;
  cover?: string;
}

export const demoMerchant: MerchantProfile = {
  storeName: "Noor Store",
  whatsapp: "+966512345678",
  bio: "متجر متخصص بالإكسسوارات الذكية والهواتف الحديثة. توصيل سريع وضمان أصلي.",
  city: "Riyadh",
  category: "Electronics",
  deliveryName: "Aramex",
  deliveryPhone: "+966500000000",
  active: true,
};

export const demoProducts: Product[] = [
  {
    id: "p1",
    title: "AirBuds Pro 2",
    description: "Wireless earbuds with active noise cancellation and 30h battery.",
    price: 499,
    discountPrice: 399,
    currency: "SAR",
    category: "Electronics",
    color: "Black",
    condition: "new",
    availability: "in_stock",
    keywords: ["earbuds", "wireless", "headphones", "سماعات"],
    image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=600&q=70&auto=format&fit=crop",
  },
  {
    id: "p2",
    title: "Smart Watch X",
    description: "Stainless steel smart watch with heart rate and GPS.",
    price: 899,
    currency: "SAR",
    category: "Electronics",
    color: "Silver",
    condition: "new",
    availability: "in_stock",
    keywords: ["watch", "smartwatch", "ساعة"],
    image: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&q=70&auto=format&fit=crop",
  },
  {
    id: "p3",
    title: "Leather Wallet",
    description: "Hand-stitched genuine leather wallet, slim profile.",
    price: 199,
    currency: "SAR",
    category: "Accessories",
    color: "Brown",
    condition: "new",
    availability: "in_stock",
    keywords: ["wallet", "leather", "محفظة"],
    image: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&q=70&auto=format&fit=crop",
  },
  {
    id: "p4",
    title: "Wireless Charger",
    description: "15W fast wireless charging pad with USB-C.",
    price: 149,
    discountPrice: 119,
    currency: "SAR",
    category: "Electronics",
    color: "White",
    condition: "new",
    availability: "in_stock",
    keywords: ["charger", "wireless", "شاحن"],
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&q=70&auto=format&fit=crop",
  },
];

export const demoOrders: Order[] = [
  {
    id: "o1",
    customerName: "Ahmed Ali",
    customerPhone: "+966555111222",
    customerLocation: "Riyadh, Al Olaya",
    productTitle: "AirBuds Pro 2",
    quantity: 1,
    deliveryCompany: "Aramex",
    status: "new",
    createdAt: "2025-05-26T10:24:00Z",
  },
  {
    id: "o2",
    customerName: "Sara Khalid",
    customerPhone: "+966555333444",
    customerLocation: "Jeddah, Al Hamra",
    productTitle: "Smart Watch X",
    quantity: 1,
    deliveryCompany: "Aramex",
    status: "merchant_notified",
    createdAt: "2025-05-26T08:02:00Z",
  },
  {
    id: "o3",
    customerName: "Omar Hassan",
    customerPhone: "+966555555666",
    customerLocation: "Dammam",
    productTitle: "Leather Wallet",
    quantity: 2,
    deliveryCompany: "Aramex",
    status: "delivery_notified",
    createdAt: "2025-05-25T19:11:00Z",
  },
  {
    id: "o4",
    customerName: "Layla Mohammed",
    customerPhone: "+966555777888",
    customerLocation: "Riyadh, Al Malqa",
    productTitle: "Wireless Charger",
    quantity: 1,
    deliveryCompany: "Aramex",
    status: "completed",
    createdAt: "2025-05-24T14:35:00Z",
  },
];

export const dashboardStats = {
  products: demoProducts.length,
  searches: 1842,
  leads: demoOrders.length,
  completion: 85,
};
