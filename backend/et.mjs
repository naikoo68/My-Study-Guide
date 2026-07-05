import { MongoMemoryServer } from "mongodb-memory-server";
const mongo = await MongoMemoryServer.create();
process.env.MONGO_URI = mongo.getUri("msg");
process.env.JWT_SECRET = "k";
process.env.NODE_ENV = "test";
process.env.AUTO_SEED = "off";
const connectDB = (await import("./src/config/db.js")).default;
await connectDB();
const { seedDatabase } = await import("./src/utils/seedData.js");
await seedDatabase({ reset: true });
const app = (await import("./src/app.js")).default;
const server = app.listen(5093);
const BASE = "http://localhost:5093/api";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) });
const login = (email, password) => fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }).then(j);
let pass = 0, fail = 0;
const check = (n, c) => { c ? pass++ : fail++; console.log(c ? "✔" : "✖", n); };
try {
  const adminTok = (await login("admin@myprepmart.com", "admin123")).body.token;
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${adminTok}` };
  const users = (await j(await fetch(`${BASE}/users`, { headers: auth }))).body.users;
  const admin = users.find((u) => u.role === "admin");

  // Edit admin: change email + password
  const upd = await j(await fetch(`${BASE}/users/${admin._id}`, { method: "PUT", headers: auth, body: JSON.stringify({ email: "adilnaik19@gmail.com", password: "Aadilnaikoo" }) }));
  check("update returns new email", upd.body.email === "adilnaik19@gmail.com");

  // Old creds no longer work
  check("old admin login fails", (await login("admin@myprepmart.com", "admin123")).status === 401);
  // New creds work (and case-insensitive)
  check("new admin login works", (await login("adilnaik19@gmail.com", "Aadilnaikoo")).status === 200);
  check("new admin login case-insensitive email", (await login("AdilNaik19@Gmail.com", "Aadilnaikoo")).status === 200);

  // Editing name/plan without password keeps password
  const admin2 = (await j(await fetch(`${BASE}/users`, { headers: auth }))).body.users.find((u) => u.role === "admin");
  await j(await fetch(`${BASE}/users/${admin2._id}`, { method: "PUT", headers: auth, body: JSON.stringify({ name: "Aadil", plan: "Pro" }) }));
  check("password unchanged when blank", (await login("adilnaik19@gmail.com", "Aadilnaikoo")).status === 200);

  // Duplicate email rejected
  const student = (await j(await fetch(`${BASE}/users`, { headers: auth }))).body.users.find((u) => u.role === "student");
  const dup = await j(await fetch(`${BASE}/users/${student._id}`, { method: "PUT", headers: auth, body: JSON.stringify({ email: "adilnaik19@gmail.com" }) }));
  check("duplicate email rejected (409)", dup.status === 409);
} catch (e) { console.error(e); fail++; }
finally {
  server.close();
  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();
  await mongo.stop();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
