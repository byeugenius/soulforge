import { inventoryAlerts, salesReport } from "./analytics.js";
import { createProduct, createUser, handle, sendMail } from "./god.js";
import { logRequest, rateLimit } from "./middleware.js";

export function processRequest(
  method: string,
  path: string,
  body: any,
  token?: string,
  ip?: string,
) {
  if (ip && !rateLimit(ip)) {
    return { ok: false, error: "rate limited" };
  }
  const result = handle(method, path, body, token);
  logRequest(method, path);
  return result;
}

export function seedData() {
  createUser({ id: "u_admin", name: "Admin", email: "admin@test.com", role: "admin" });
  createUser({ id: "u_jane", name: "Jane", email: "jane@test.com", role: "user" });
  createProduct({
    id: "p_1",
    name: "Widget",
    desc: "A versatile widget for everyday use",
    category: "tools",
    tags: ["hardware", "essential"],
    price: 9.99,
    stock: 100,
  });
  createProduct({
    id: "p_2",
    name: "Gadget",
    desc: "High-tech gadget with multiple functions",
    category: "electronics",
    tags: ["tech", "premium"],
    price: 24.99,
    stock: 50,
  });
  createProduct({
    id: "p_3",
    name: "Doohickey",
    desc: "Simple doohickey that gets the job done",
    category: "tools",
    tags: ["hardware", "budget"],
    price: 4.99,
    stock: 200,
  });
}

export function runDailyReport() {
  const report = salesReport();
  const alerts = inventoryAlerts();
  sendMail(
    "admin@test.com",
    "Daily Report",
    `Revenue: $${String(report.totalRevenue)} | Orders: ${String(report.orderCount)} | Low stock: ${String(alerts.length)}`,
  );
  return { report, alerts };
}