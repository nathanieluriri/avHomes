/**
 * @avhomes/core
 *
 * Server infrastructure with no domain knowledge: the error table, request
 * parsing, keyset paging, ids, environment and the mail port. Every feature
 * package imports this; nothing here imports a feature package.
 */
export {
  ApiError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  StaleWriteError,
  PreconditionFailedError,
  DuplicateError,
  RateLimitedError,
  NotImplementedError,
  UpstreamError,
  InvalidDocumentApiError,
  toResponse,
  logLine,
  debugErrorsEnabled,
  type ErrorCode,
  type ErrorContext,
} from "./errors";

export {
  str,
  email,
  slugString,
  zodDetail,
  readJson,
  readJsonOrEmpty,
  readQuery,
  pathParam,
} from "./parse";

export {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  encodeCursor,
  decodeCursor,
  keysetFilter,
  assertCursorSort,
  keysetSort,
  takePage,
  clampLimit,
  type SortSpec,
  type SortDirection,
  type CursorValue,
} from "./cursor";

export {
  getEnv,
  resetEnv,
  databaseConfig,
  sessionSecret,
  requestOrigin,
  isProduction,
  type Env,
} from "./env";

export {
  currentDb,
  currentUser,
  requestId,
  clientIp,
  type AppEnv,
  type AppVariables,
} from "./app-env";

export { newId, isId, idTime, slugify, disambiguateSlug, ID_PREFIXES, type IdPrefix } from "./ids";

export {
  unconfiguredMailer,
  resendMailer,
  trySend,
  type Mailer,
  type MailMessage,
} from "./mail";
