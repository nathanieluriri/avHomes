// `next dev` on :3300 against the local demo database (a mongod on 127.0.0.1:27018 seeded by
// scripts/seed-demo.ts). Set here because they are local, non-secret values; Next never
// overrides a variable that is already set, so these win over .env.local.
process.env.MONGODB_URI = "mongodb://127.0.0.1:27018";
process.env.MONGODB_DB = "avhomes_demo";
process.argv = [process.argv[0], "next", "dev", "--port", "3300"];
await import("../node_modules/next/dist/bin/next");
