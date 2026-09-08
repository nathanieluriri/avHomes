import { COLLECTIONS, collection, getDb } from "@avhomes/db";
import { databaseConfig } from "@avhomes/core";
import { docToText, readingMinutes, wordCount } from "@avhomes/contracts";
import { demoProperties, demoStats, demoTestimonials } from "../src/lib/demo-data";
import { demoPostSeeds } from "../src/lib/blog/demo-posts";

/**
 * Fills an empty database with the fixtures the app already ships.
 *
 * IT SEEDS FROM `src/lib/demo-data.ts` RATHER THAN FROM A SECOND LIST OF ITS
 * OWN, and that is the whole design. Those fixtures are what the site renders
 * when there is no database, so seeding from anything else would give a fresh
 * checkout two different notions of what the demo site looks like, and the two
 * would drift the first time somebody edited one of them.
 *
 * UPSERTS ON A DERIVED ID, so running it twice is the same as running it once.
 * Ids are `demo_<slug>`, which is also what makes `--reset` able to remove
 * exactly what this script wrote and nothing an operator typed by hand.
 *
 * It refuses to touch a collection that already holds records it did not write,
 * unless `--force` says otherwise. Seeding demo listings into a database that
 * has real ones is the mistake worth making expensive.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/seed-demo.ts
 *   npx tsx --env-file-if-exists=.env.local scripts/seed-demo.ts --reset
 *   npx tsx --env-file-if-exists=.env.local scripts/seed-demo.ts --force
 *
 * Enquiries are deliberately NOT seeded. Everything here is content the site
 * owner would write themselves; a fake enquiry is a fake person with a fake
 * phone number sitting in an inbox that exists to be answered.
 */

/**
 * Documents carry a STRING `_id` in this codebase, never an ObjectId, so the
 * handles have to be typed or the driver assumes the default and every filter
 * below is a type error against a shape this database does not use.
 */
interface SeedDoc {
  _id: string;
  [field: string]: unknown;
}

const RESET = process.argv.includes("--reset");
const FORCE = process.argv.includes("--force");
const PREFIX = "demo_";

function idFor(slug: string): string {
  return `${PREFIX}${slug}`;
}

async function main(): Promise<void> {
  const db = await getDb(databaseConfig());
  const now = Date.now();

  const properties = collection<SeedDoc>(db, COLLECTIONS.properties);
  const stats = collection<SeedDoc>(db, COLLECTIONS.siteStats);
  const testimonials = collection<SeedDoc>(db, COLLECTIONS.testimonials);
  const posts = collection<SeedDoc>(db, COLLECTIONS.posts);
  const categories = collection<SeedDoc>(db, COLLECTIONS.categories);

  if (RESET) {
    const removed = await Promise.all([
      properties.deleteMany({ _id: { $regex: `^${PREFIX}` } }),
      stats.deleteMany({ _id: { $regex: `^${PREFIX}` } }),
      testimonials.deleteMany({ _id: { $regex: `^${PREFIX}` } }),
      posts.deleteMany({ _id: { $regex: `^${PREFIX}` } }),
      categories.deleteMany({ _id: { $regex: `^${PREFIX}` } }),
    ]);
    console.log(`removed  ${removed[0].deletedCount} properties`);
    console.log(`removed  ${removed[1].deletedCount} counters`);
    console.log(`removed  ${removed[2].deletedCount} testimonials`);
    console.log(`removed  ${removed[3].deletedCount} posts`);
    console.log(`removed  ${removed[4].deletedCount} categories`);
    console.log("\nOnly documents this script wrote were touched.");
    process.exit(0);
  }

  /*
   * The guard. A record without the prefix was not written here, so it was
   * either typed into the console or seeded before this script existed, and
   * either way it is not ours to bury under fixtures.
   */
  const notOurs = { _id: { $not: { $regex: `^${PREFIX}` } } };
  const [foreignListings, foreignPosts] = await Promise.all([
    properties.countDocuments(notOurs),
    posts.countDocuments(notOurs),
  ]);
  const foreign = foreignListings + foreignPosts;
  if (foreign > 0 && !FORCE) {
    const parts = [
      foreignListings > 0 ? `${foreignListings} listing${foreignListings === 1 ? "" : "s"}` : null,
      foreignPosts > 0 ? `${foreignPosts} post${foreignPosts === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    console.error(
      `Refusing to seed: ${parts.join(" and ")} in this database ` +
        `${foreign === 1 ? "was" : "were"} not written by this script.\n` +
        `Pass --force to seed anyway, or --reset to remove only what this script wrote.`,
    );
    process.exit(1);
  }

  let written = 0;
  for (const property of demoProperties) {
    if (!property.slug) continue;
    const _id = idFor(property.slug);
    /*
     * `createdAt` and `revision` are pulled OUT of the update, not just left
     * out of it. They belong to the document's own history: a re-run must not
     * rewrite when the record appeared, and must not reset the CAS token under
     * an editor that has the record open. Mongo also refuses a field named by
     * both `$set` and `$setOnInsert`, so leaving them in the spread is an error
     * rather than a silent overwrite.
     */
    const { id: _demoId, createdAt, revision, ...fields } = property;
    void _demoId;
    await properties.updateOne(
      { _id },
      {
        $set: { ...fields, updatedAt: now },
        $setOnInsert: { createdAt, revision },
      },
      { upsert: true },
    );
    written += 1;
  }
  console.log(`listings      ${written}`);

  let statCount = 0;
  for (const stat of demoStats) {
    const { id: _statId, ...fields } = stat;
    void _statId;
    await stats.updateOne(
      { _id: idFor(`stat-${stat.position}`) },
      {
        $set: {
          ...fields,
          suffix: stat.suffix ?? null,
          prefix: stat.prefix ?? null,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    statCount += 1;
  }
  console.log(`counters      ${statCount}`);

  let quoteCount = 0;
  for (const testimonial of demoTestimonials) {
    const { id: _quoteId, ...fields } = testimonial;
    void _quoteId;
    await testimonials.updateOne(
      { _id: idFor(`quote-${testimonial.position}`) },
      { $set: { ...fields, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    quoteCount += 1;
  }
  console.log(`testimonials  ${quoteCount}`);

  /*
   * Posts are attributed to the OWNER, never to invented authors.
   *
   * The fixtures name three writers, and reproducing that faithfully would mean
   * three rows in `users`. This script does not write to `users`, for the same
   * reason it does not write enquiries: a fabricated colleague is a person
   * somebody eventually tries to email, and they show up in the team screen
   * looking exactly like a real account. Where no owner exists yet the join
   * simply misses and the reader renders the site name instead, which is the
   * behaviour the repo already defines for an unknown author.
   */
  const owner = await collection<{ _id: string; role: string; disabledAt: number | null }>(
    db,
    COLLECTIONS.users,
  ).findOne({ role: "owner", disabledAt: null }, { projection: { _id: 1 } });
  const authorId = owner?._id ?? `${PREFIX}unknown-author`;

  let postCount = 0;
  for (const seed of demoPostSeeds) {
    const text = docToText(seed.body);
    const words = wordCount(text);
    const publishedAt = Date.parse(`${seed.published}T09:00:00Z`);
    await posts.updateOne(
      { _id: idFor(seed.slug) },
      {
        $set: {
          slug: seed.slug,
          title: seed.title,
          subtitle: seed.subtitle,
          excerpt: seed.excerpt,
          excerptSource: "author",
          content: seed.body,
          contentText: text,
          coverImage: {
            url: seed.cover,
            alt: seed.coverAlt,
            focalPoint: "50% 50%",
            width: 1600,
            height: 900,
          },
          category: seed.category,
          tags: seed.tags,
          template: seed.template,
          status: "published",
          wordCount: words,
          readingTime: readingMinutes(words),
          authorId,
          publishedAt,
          deletedAt: null,
          updatedAt: Date.parse(`${seed.updated}T09:00:00Z`),
        },
        // The publish date is the document's own history, so a re-run must not
        // move it, and the CAS token must not reset under an open editor.
        $setOnInsert: { createdAt: publishedAt, revision: 1 },
      },
      { upsert: true },
    );
    postCount += 1;
  }
  console.log(`posts         ${postCount}`);

  const categoryNames = [...new Set(demoPostSeeds.map((s) => s.category))];
  let categoryCount = 0;
  for (const [position, name] of categoryNames.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await categories.updateOne(
      { _id: idFor(`category-${slug}`) },
      {
        $set: { slug, name, blurb: "", accent: "#983c53", position, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    categoryCount += 1;
  }
  console.log(`categories    ${categoryCount}`);

  const featured = demoProperties.filter((p) => p.featured).length;
  console.log(`\n${featured} listings are featured, and the homepage shows six of them.`);
  console.log("Re-running is safe. `--reset` removes only what this wrote.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
