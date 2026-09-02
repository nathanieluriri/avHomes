/**
 * @avhomes/media
 *
 * The image library and its storage port. It may not import any other feature
 * package; consumers store the resolved URL a upload returns.
 */
export { mediaRoutes } from "./routes";
export { unconfiguredStorage, vercelBlobStorage, type StoragePort, type StoredObject } from "./storage";
export { sniffImage, type SniffedImage } from "./sniff";
