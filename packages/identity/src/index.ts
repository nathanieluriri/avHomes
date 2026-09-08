/**
 * @avhomes/identity
 *
 * Membership, sessions and the guards every feature package attaches. Two doors
 * prove who you are; one `admit()` decides whether this instance knows you.
 */
export {
  SESSION_TTL_MS,
  SESSION_ABSOLUTE_MAX_MS,
  INVITE_TTL_MS,
  ENQUIRY_IP_LIMIT,
  ENQUIRY_WINDOW_MS,
  CHAT_MESSAGE_IP_LIMIT,
  CHAT_MESSAGE_WINDOW_MS,
  CHAT_MAX_MESSAGES,
  CHAT_MAX_BODY,
  PULSE_IP_LIMIT,
  PULSE_WINDOW_MS,
  PULSE_NEW_IP_LIMIT,
  PULSE_NEW_WINDOW_MS,
  SUBSCRIBE_IP_LIMIT,
  SUBSCRIBE_WINDOW_MS,
  type UserDoc,
  type SessionDoc,
  type InviteDoc,
} from "./schema";

export {
  sessionMiddleware,
  rolePermissions,
  requireAuth,
  requireAdmin,
  requireOwner,
  domainFor,
  sessionCookieName,
  setSessionCookie,
  clearSessionCookie,
} from "./middleware";

export { admit, refusalBody, type AdmitResult, type AdmitRefusal, type Identity } from "./admit";
export { doorStatus, activeDoor, type AuthDoor, type DoorStatus } from "./door";

export { authRoutes } from "./routes/auth";
export { clerkRoutes, passwordRoutes, registerClerkVerifier, type ClerkVerifier } from "./routes/doors";
export { teamRoutes } from "./routes/team";

export { limit, clearLimit } from "./repo/ratelimit";
export {
  createUser,
  findUserByEmail,
  findUserById,
  listUsers,
  countActiveOwners,
  reassignListingsToOwner,
  setPasswordHash,
  toAuthUser,
  updateProfile,
  type ProfilePatch,
} from "./repo/users";
export { createSession, resolveSession, endAllSessions } from "./repo/sessions";
export { createInvite, listInvites } from "./repo/invites";
export { hashPassword, verifyPassword, mintSessionToken, tokenId } from "./crypto";
