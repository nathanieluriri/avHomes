import type { ReactNode } from "react";
import "./blog.css";

/**
 * Scopes the blog stylesheet to this route segment. Every token it declares
 * lives on .blog, so nothing leaks into the storefront theme.
 */
export default function PostsLayout({ children }: { children: ReactNode }) {
  return <div className="blog">{children}</div>;
}
