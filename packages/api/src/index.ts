/**
 * @avhomes/api
 *
 * The composition root. The ONLY package allowed to import more than one feature
 * package, and therefore the only place a seam between two of them is joined.
 */
export { createApp, app, API_PREFIX, type AppDeps } from "./app";
export { dashboardRoutes } from "./dashboard";
