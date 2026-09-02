/**
 * Break-glass: mint the singular owner account.
 *
 * This is the ONLY way to create an owner. No route mints one, `ASSIGNABLE_ROLES`
 * excludes it, and `setUserRole` refuses it in the filter itself, so "there is
 * exactly one owner" is a property of the code rather than a rule somebody
 * remembers.
 *
 * It is also the way back in when the last active owner is locked out, which is
 * why the password door has no reset flow.
 *
 * Usage:
 *   MONGODB_URI=... SESSION_SECRET=... \
 *     node --experimental-strip-types packages/identity/src/cli/bootstrap-owner.ts \
 *     --email you@example.com --name "Your Name" --password "at least twelve chars" --apply
 *
 * Without --apply it reports what it WOULD do and writes nothing.
 */
import { COLLECTIONS, closeDb, collection, getDb } from "@avhomes/db";
import { newId } from "@avhomes/core";
import { hashPassword } from "../crypto";
import type { UserDoc } from "../schema";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    process.exit(1);
  }

  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const password = arg("password");
  const apply = process.argv.includes("--apply");

  if (!email || !name) {
    console.error("Both --email and --name are required.");
    process.exit(1);
  }
  // The Clerk door needs no password; the password door needs a real one. A
  // short one is refused rather than padded, because this account is the only
  // one that can undo everything.
  if (password !== undefined && password.length < 12) {
    console.error("--password must be at least 12 characters.");
    process.exit(1);
  }

  const db = await getDb({ uri, dbName: process.env.MONGODB_DB ?? "avhomes" });
  const users = collection<UserDoc>(db, COLLECTIONS.users);

  const existingOwner = await users.findOne({ role: "owner" });
  const existingEmail = await users.findOne({ email });

  if (existingOwner && existingOwner.email !== email) {
    console.error(
      `An owner already exists: ${existingOwner.email}. Promote through the admin, or disable that account first.`,
    );
    await closeDb();
    process.exit(1);
  }

  if (existingEmail) {
    console.log(`${email} already exists as ${existingEmail.role}.`);
    if (!apply) {
      console.log("Would promote to owner, re-enable, and set the password if given. Pass --apply.");
      await closeDb();
      return;
    }
    await users.updateOne(
      { _id: existingEmail._id },
      {
        $set: {
          role: "owner",
          disabledAt: null,
          displayName: name,
          updatedAt: Date.now(),
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
        },
      },
    );
    console.log(`Promoted ${email} to owner.`);
    await closeDb();
    return;
  }

  if (!apply) {
    console.log(`Would create owner ${email} (${name}). Pass --apply to write it.`);
    await closeDb();
    return;
  }

  const now = Date.now();
  await users.insertOne({
    _id: newId("usr", now),
    email,
    displayName: name,
    role: "owner",
    passwordHash: password ? await hashPassword(password) : null,
    createdAt: now,
    updatedAt: now,
    disabledAt: null,
  });
  console.log(`Created owner ${email}.`);
  await closeDb();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  await closeDb().catch(() => {});
  process.exit(1);
});
