"use client";

import { MessageSquare } from "lucide-react";
import { useChat } from "@/lib/chat/provider";

/**
 * "Contact agent", as the door into the site's one chat.
 *
 * It used to own a dialog, a copy of the thread and a poller of its own. That
 * meant nothing outside this page knew a conversation existed, so a reply that
 * arrived while somebody was reading a different listing was invisible until
 * they came back and pressed this again, which from the buyer's side is the
 * same as not being answered.
 *
 * Now it asks the provider to open, and hands it enough to either resume the
 * conversation about THIS property or start one. The `key` is what makes that
 * work: a second enquiry about the same listing continues the first rather than
 * opening a duplicate thread the team then answers twice.
 */
export default function AgentChat({
  propertyId,
  propertySlug,
  propertyTitle,
}: {
  propertyId?: string;
  propertySlug?: string;
  propertyTitle?: string;
}) {
  const chat = useChat();
  const key = propertyId ?? "general";
  const mine = chat.threads.filter((thread) => thread.key === key);
  const unread = mine.reduce((sum, thread) => sum + chat.unreadFor(thread.id), 0);

  return (
    <button
      type="button"
      onClick={() =>
        chat.openChat({
          key,
          title: propertyTitle ?? "AVHomes",
          ...(propertySlug ? { path: `/listings/${propertySlug}`, propertySlug } : {}),
          ...(propertyId ? { propertyId } : {}),
        })
      }
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-wine-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
    >
      <MessageSquare className="h-4 w-4" aria-hidden="true" />
      {/* The label changes once a conversation exists, because "Contact agent"
          over an answered thread invites somebody to start a second one. */}
      {mine.length > 0 ? "Open your conversation" : "Contact agent"}
      {unread > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[11px] font-bold text-wine-700">
          {unread}
        </span>
      )}
    </button>
  );
}
