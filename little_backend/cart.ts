import type { Order, Result } from "./types.js";
import { getProduct, updateStock, createOrder } from "./db.js";

const carts = new Map<string, Map<string, number>>();

export function addToCart(userId: string, productId: string, qty: number): Result<null> {
  const product = getProduct(productId);
  if (!product) return { ok: false, error: "product not found" };
  if (product.stock < qty) return { ok: false, error: "insufficient stock" };

  let cart = carts.get(userId);
  if (!cart) {
    cart = new Map();
    carts.set(userId, cart);
  }
  const current = cart.get(productId) ?? 0;
  cart.set(productId, current + qty);
  return { ok: true, data: null };
}

export function checkout(userId: string): Result<Order> {
  const cart = carts.get(userId);
  if (!cart || cart.size === 0) return { ok: false, error: "cart empty" };

  let total = 0;
  const items: Order["items"] = [];

  for (const [productId, qty] of cart) {
    const product = getProduct(productId);
    if (!product) return { ok: false, error: `product ${productId} gone` };

    total += product.price * qty;
    items.push({ productId, qty });
  }

  for (const item of items) {
    const ok = updateStock(item.productId, -item.qty);
    if (!ok) return { ok: false, error: `stock failed for ${item.productId}` };
  }

  const order: Order = {
    id: `ord_${Date.now()}`,
    userId,
    items,
    total,
    status: "pending",
  };
  createOrder(order);
  carts.delete(userId);
  return { ok: true, data: order };
}

export function getCart(userId: string) {
  return carts.get(userId) ?? new Map();
}

export function clearCart(userId: string) {
  carts.delete(userId);
}
