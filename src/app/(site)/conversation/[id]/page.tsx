import type { Metadata } from "next";
import ConversationReply from "./ConversationReply";

export const metadata: Metadata = {
  title: "Your conversation | AVHomes",
  // A private thread opened by an emailed link. Never indexed, never previewed.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationReply id={id} />;
}
