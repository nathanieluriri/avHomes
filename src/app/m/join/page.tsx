"use client";

import { JoinFlow } from "@/components/marketer/JoinFlow";

/** Joining with no code: nobody gets credited for the invite. */
export default function JoinPage() {
  return <JoinFlow code="" />;
}
