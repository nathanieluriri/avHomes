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
  type PartnerDoc,
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
export { applicationAdminRoutes, applicationPublicRoutes } from "./routes/applications";
export { partnerAdminRoutes } from "./routes/partners";
export { offboardPartnerAccount, agentCardOf, type PartnerPorts } from "./partner-accounts";
export {
  createApplication,
  decideApplication,
  getApplication,
  listApplications,
  openApplicationCount,
  reopenApplication,
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type PartnerApplication,
} from "./repo/applications";

export { limit, clearLimit } from "./repo/ratelimit";
export {
  createUser,
  findCredentialByEmail,
  findUserByEmail,
  findUserById,
  listUsers,
  countActiveOwners,
  reassignListingsToOwner,
  setPasswordHash,
  setPartnerRole,
  toAuthUser,
  updateProfile,
  type ProfilePatch,
} from "./repo/users";
export { createSession, resolveSession, endAllSessions } from "./repo/sessions";
export {
  createInvite,
  listInvites,
  revokeTeamInvite,
  revokePartnerInvite,
} from "./repo/invites";
export {
  partnerIdForApplication,
  upsertPartnerForApplication,
  findPartner,
  listPartners,
  setPartnerMain,
  updatePartner,
  setPartnerStatus,
  isSuspendedPartner,
  partnerAccounts,
  partnerUserIds,
  openPartnerInvites,
  countStaffSeats,
  type PartnerPatch,
} from "./repo/partners";
export {
  readPartnerSettings,
  writePartnerSettings,
  limitsForPartner,
} from "./repo/partner-settings";
export { hashPassword, verifyPassword, burnPasswordTime, mintSessionToken, tokenId } from "./crypto";
