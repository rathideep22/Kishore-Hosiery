import { useState, useEffect } from 'react';
import { api } from '../utils/api';

interface Product {
  id: string;
  category: string;
  size: string;
  printName: string;
  alias: string;
  createdAt: string;
}

export function useProducts(godown?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = godown ? `/products?godown=${godown}` : '/products';
      const data = await api.get(endpoint);
      setProducts(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch products');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [godown]);

  return { products, loading, error, refetch: fetchProducts };
}

export function groupProductsByCategory(products: Product[]) {
  const grouped: Record<string, Product[]> = {};
  products.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });
  return grouped;
}

export function filterProducts(
  products: Product[],
  searchQuery: string
): Product[] {
  if (!searchQuery.trim()) return products;

  const q = searchQuery.toLowerCase();
  return products.filter(p =>
    p.category.toLowerCase().includes(q) ||
    p.size.toLowerCase().includes(q) ||
    p.alias.toLowerCase().includes(q) ||
    p.printName.toLowerCase().includes(q)
  );
}
