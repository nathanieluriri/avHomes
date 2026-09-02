/**
 * @avhomes/media
 *
 * The image library and its storage port. It may not import any other feature
 * package; consumers store the resolved URL an upload returns.
 */
export { mediaRoutes, mediaPublicRoutes } from "./routes";
export {
  unconfiguredStorage,
  vercelBlobStorage,
  type StoragePort,
  type StoredObject,
  type StoredFile,
} from "./storage";
export { localFileStorage } from "./storage-local";
export { sniffImage, type SniffedImage } from "./sniff";
