"use client";

import { useParams } from "next/navigation";
import { JoinFlow } from "@/components/marketer/JoinFlow";

/**
 * Joining from somebody's link.
 *
 * The code is read with `useParams` rather than the page's own props because
 * this screen is a client component: the props form of `params` is a promise
 * that only a server component can await.
 */
export default function JoinWithCodePage() {
  const params = useParams<{ code: string }>();
  return <JoinFlow code={params.code ?? ""} />;
}
