import type { Result } from "./types.js";
import { verify } from "./auth.js";
import { getUser, createUser, listProducts, getProduct } from "./db.js";
import { addToCart, checkout, getCart } from "./cart.js";
import { sendEmail } from "./notifications.js";

type Handler = (body: any, token?: string) => Result<any>;

const routes: Record<string, Handler> = {
  "GET /products": () => ({ ok: true, data: listProducts() }),

  "GET /product": (body) => {
    const p = getProduct(body.id);
    if (!p) return { ok: false, error: "not found" };
    return { ok: true, data: p };
  },

  "POST /register": (body) => {
    const ok = createUser({
      id: `usr_${Date.now()}`,
      name: body.name,
      email: body.email,
      role: "user",
    });
    if (!ok) return { ok: false, error: "already exists" };
    sendEmail(body.email, "Welcome!", `Hi ${body.name}`);
    return { ok: true, data: { registered: true } };
  },

  "POST /cart/add": (body, token) => {
    const session = verify(token!);
    if (!session.ok) return session;
    return addToCart(session.data.userId, body.productId, body.qty);
  },

  "POST /checkout": (_body, token) => {
    const session = verify(token!);
    if (!session.ok) return session;
    const result = checkout(session.data.userId);
    if (result.ok) {
      const user = getUser(session.data.userId);
      sendEmail(user!.email, "Order confirmed", `Order ${result.data.id}`);
    }
    return result;
  },

  "GET /cart": (_body, token) => {
    const session = verify(token!);
    if (!session.ok) return session;
    const cart = getCart(session.data.userId);
    return { ok: true, data: [...cart.entries()] };
  },
};

export function handle(method: string, path: string, body: any, token?: string): Result<any> {
  const key = `${method} ${path}`;
  const handler = routes[key];
  if (!handler) return { ok: false, error: `no route: ${key}` };
  return handler(body, token);
}
