"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { MessageSquare, X } from "lucide-react";
import AgentChat from "@/components/AgentChat";
import { useChat } from "@/lib/chat/provider";

/**
 * Which estate option the buyer asked about, shared between the Options list
 * and the agent panel so both name the same one.
 *
 * ONE THREAD PER ESTATE, not one per option: a buyer weighing house types is
 * one conversation with one consultant, and per-option threads would have the
 * team answering the same person in parallel. So the option cannot ride in the
 * thread's key or title, which are fixed once the thread exists. It rides in
 * the MESSAGE instead: `openChat` writes it into the composer of the new or the
 * resumed thread, and the team reads it in the conversation itself.
 */
interface ChosenOption {
  id: string;
  label: string;
}

interface EnquiryOptionValue {
  option: ChosenOption | null;
  choose: (option: ChosenOption | null) => void;
}

const Ctx = createContext<EnquiryOptionValue | null>(null);

export function EnquiryOptionProvider({ children }: { children: ReactNode }) {
  const [option, choose] = useState<ChosenOption | null>(null);
  return <Ctx.Provider value={{ option, choose }}>{children}</Ctx.Provider>;
}

function messageFor(option: ChosenOption): string {
  return `I would like to know more about the ${option.label}.`;
}

interface Target {
  propertyId: string;
  propertySlug: string | null;
  propertyTitle: string;
}

export function AskAboutOption({
  option,
  target,
}: {
  option: ChosenOption;
  target: Target;
}) {
  const chat = useChat();
  const ctx = useContext(Ctx);

  return (
    <button
      type="button"
      onClick={() => {
        ctx?.choose(option);
        chat.openChat({
          key: target.propertyId,
          title: target.propertyTitle,
          message: messageFor(option),
          propertyId: target.propertyId,
          ...(target.propertySlug
            ? { path: `/listings/${target.propertySlug}`, propertySlug: target.propertySlug }
            : {}),
        });
      }}
      // Starts with the visible text, so a voice command of "Ask about this" still finds it.
      aria-label={`Ask about this: ${option.label}`}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-mist-200 bg-white px-5 py-2.5 text-sm font-semibold text-plum-950 transition-colors duration-200 hover:border-wine-600 hover:text-wine-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600 sm:w-auto"
    >
      <MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      Ask about this
    </button>
  );
}

/**
 * The panel's contact button, under the option the buyer last asked about.
 *
 * "Contact agent" opens the same estate thread, and the prefill `AskAboutOption`
 * wrote is still in its composer until it is sent, so the line here stays true.
 */
export function OptionAwareContact(target: Target) {
  const chat = useChat();
  const ctx = useContext(Ctx);
  const option = ctx?.option ?? null;

  return (
    <>
      {option && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-mist-200 bg-mist-50 px-4 py-3">
          <p className="min-w-0 text-sm text-plum-950/80">
            Asking about{" "}
            <span className="font-semibold text-plum-950">{option.label}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              // An unedited "about the plot" line would contradict the choice just made.
              chat.withdraw(target.propertyId, messageFor(option));
              ctx?.choose(null);
            }}
            aria-label="Ask about the whole estate instead"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition-colors hover:bg-mist-100 hover:text-plum-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
          >
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      )}
      <AgentChat
        propertyId={target.propertyId}
        propertySlug={target.propertySlug ?? undefined}
        propertyTitle={target.propertyTitle}
      />
    </>
  );
}
