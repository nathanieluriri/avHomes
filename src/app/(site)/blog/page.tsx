import { redirect } from "next/navigation";

// The blog moved to /posts, which is where tag chips and share links point.
export default function BlogIndexRedirect() {
  redirect("/posts");
}
