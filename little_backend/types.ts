export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  userId: string;
  items: { productId: string; qty: number }[];
  total: number;
  status: "pending" | "paid" | "shipped";
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
