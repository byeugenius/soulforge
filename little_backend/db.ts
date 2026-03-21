import type { User, Product, Order } from "./types.js";

const users = new Map<string, User>();
const products = new Map<string, Product>();
const orders = new Map<string, Order>();

export function getUser(id: string): User | undefined {
  return users.get(id);
}

export function createUser(user: User) {
  if (users.has(user.id)) return false;
  users.set(user.id, user);
  return true;
}

export function getProduct(id: string) {
  return products.get(id);
}

export function createProduct(p: Product) {
  products.set(p.id, p);
}

export function updateStock(productId: string, delta: number): boolean {
  const p = products.get(productId);
  if (!p) return false;
  p.stock += delta;
  return p.stock >= 0;
}

export function createOrder(order: Order) {
  orders.set(order.id, order);
}

export function getOrder(id: string) {
  return orders.get(id);
}

export function getUserOrders(userId: string): Order[] {
  return [...orders.values()].filter((o) => o.userId === userId);
}

export function listProducts(): Product[] {
  return [...products.values()];
}
