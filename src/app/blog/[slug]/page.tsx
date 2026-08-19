import { redirect } from "next/navigation";

export default async function BlogPostRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/posts/${slug}`);
}
