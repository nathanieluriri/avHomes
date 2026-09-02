/**
 * Blog configuration.
 *
 * The blog used to live in a separate admin application and this file named its
 * host. It is now part of this application: posts are served by
 * `/api/public/posts` from the same origin, out of the same MongoDB, and edited
 * in `/admin/posts`.
 */
import type { ReadingTemplate } from "@avhomes/contracts";
import { DETAIL_REVALIDATE, LIST_REVALIDATE, SITE_DOMAIN, SITE_NAME } from "../api-config";

export { SITE_DOMAIN, SITE_NAME };

/** A published post rarely changes. Lists move more often. */
export const POST_DETAIL_REVALIDATE = DETAIL_REVALIDATE;
export const POST_LIST_REVALIDATE = LIST_REVALIDATE;

export const BLOG_DEFAULT_TEMPLATE: ReadingTemplate = "magazine";
export const SHOW_READING_TIME = true;
