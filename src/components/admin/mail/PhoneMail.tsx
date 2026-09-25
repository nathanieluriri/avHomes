"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Check, Menu, Pencil, Search, Settings, X } from "lucide-react";
import type { MailboxSummary } from "@avhomes/contracts";
import { Badge } from "@/components/admin/ui";
import { usage } from "./AccountSwitcher";
import { LetterAvatar } from "./shared";

/**
 * A phone panel: a drawer from the left (folders) or a sheet that takes the
 * full height (mailboxes). The console's BottomSheet stops at 88dvh and has no
 * side form, and both of these follow Gmail's app instead.
 */
export function PhoneSheet({
  open,
  onOpenChange,
  title,
  description,
  side,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side: "left" | "full";
  children: ReactNode;
}) {
  const shape =
    side === "left"
      ? "inset-y-0 left-0 w-[min(20rem,86vw)] rounded-r-2xl pt-[env(safe-area-inset-top)] data-[state=open]:slide-in-from-left"
      : "inset-x-0 bottom-0 top-[calc(0.75rem+env(safe-area-inset-top))] rounded-t-2xl data-[state=open]:slide-in-from-bottom";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="console-float fixed inset-0 z-[70] bg-plum-950/45 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`console console-float fixed z-[71] flex flex-col overflow-hidden bg-white shadow-pop data-[state=open]:animate-in ${shape}`}
        >
          <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-[17px] font-semibold text-plum-950">{title}</Dialog.Title>
              {description && <p className="truncate text-[12.5px] text-slate-600">{description}</p>}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                title="Close"
                className="c-tap -mr-2 grid h-11 w-11 place-items-center rounded-full text-slate-600 hover:bg-mist-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(1rem+var(--safe-b))]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Gmail's app bar: a pill with the drawer on the left and the account on the right. */
export function PhoneSearchBar({
  value,
  address,
  onChange,
  onSubmit,
  onMenu,
  onAccount,
}: {
  value: string;
  address: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onMenu: () => void;
  onAccount: () => void;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center px-3">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          onSubmit();
        }}
        className="flex h-12 min-w-0 flex-1 items-center gap-0.5 rounded-full border border-mist-200 bg-white px-1 shadow-card focus-within:border-wine-500"
      >
        <button
          type="button"
          aria-label="Folders"
          title="Folders"
          onClick={onMenu}
          className="c-tap grid h-10 w-10 shrink-0 place-items-center rounded-full text-plum-950 hover:bg-mist-100"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <label className="flex min-w-0 flex-1 items-center">
          <span className="sr-only">Search mail</span>
          <input
            type="search"
            enterKeyHint="search"
            value={value}
            placeholder="Search in mail"
            onChange={(event) => onChange(event.target.value)}
            // The pill's border shows focus instead of a ring inside it.
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent px-1.5 text-[16px] text-plum-950 outline-none placeholder:text-slate-550 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        {value !== "" ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="c-tap grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-mist-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <Search className="mr-1 h-5 w-5 shrink-0 text-slate-550" aria-hidden="true" />
        )}
        <button
          type="button"
          aria-label={`Mailbox: ${address}. Switch mailbox`}
          title={address}
          onClick={onAccount}
          className="c-tap grid h-10 w-10 shrink-0 place-items-center rounded-full"
        >
          <LetterAvatar text={address} toneKey={address} size="sm" />
        </button>
      </form>
    </div>
  );
}

function StorageBar({ m }: { m: MailboxSummary }) {
  const q = m.quota;
  if (!q || !q.supported) return null;
  const percent = q.storageLimitKb > 0 ? Math.min(100, (q.storageUsedKb / q.storageLimitKb) * 100) : 0;
  return (
    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-mist-200">
      <span
        className={`block h-full rounded-full ${percent > 90 ? "bg-red-600" : "bg-wine-600"}`}
        style={{ width: `${Math.max(percent, 1)}%` }}
      />
    </span>
  );
}

/** Every mailbox the key reaches, the open one first, as Gmail's account sheet. */
export function PhoneAccountSheet({
  open,
  onOpenChange,
  mailboxes,
  current,
  senderId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mailboxes: MailboxSummary[];
  current: string;
  senderId: string;
  onPick: (id: string) => void;
}) {
  const router = useRouter();
  const active = mailboxes.find((m) => m.resourceId === current) ?? mailboxes[0];
  const others = mailboxes.filter((m) => m.resourceId !== active.resourceId);

  return (
    <PhoneSheet open={open} onOpenChange={onOpenChange} title="Mailboxes" side="full">
      <div className="rounded-2xl bg-mist-50 p-4">
        <div className="flex items-center gap-3">
          <LetterAvatar text={active.address} toneKey={active.address} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-plum-950">{active.address}</p>
            <p className="truncate text-[12.5px] text-slate-600">{usage(active)}</p>
          </div>
          <Check className="h-5 w-5 shrink-0 text-wine-600" aria-label="Current mailbox" />
        </div>
        <StorageBar m={active} />
        {active.resourceId === senderId && (
          <p className="mt-2">
            <Badge tone="wine">Sends site mail</Badge>
          </p>
        )}
      </div>

      {others.length > 0 && (
        <>
          <p className="px-2 pb-1 pt-4 text-[12px] font-semibold text-slate-600">Switch to</p>
          <ul>
            {others.map((m) => (
              <li key={m.resourceId}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(m.resourceId);
                    onOpenChange(false);
                  }}
                  className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-mist-100"
                >
                  <LetterAvatar text={m.address} toneKey={m.address} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-plum-950">{m.address}</span>
                    <span className="block truncate text-[12px] text-slate-600">{usage(m)}</span>
                    <StorageBar m={m} />
                  </span>
                  {m.resourceId === senderId && <Badge tone="wine">Site mail</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-3 border-t border-mist-200 pt-2">
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            router.push("/admin/settings");
          }}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[14.5px] font-medium text-plum-950 active:bg-mist-100"
        >
          <span className="grid h-10 w-10 place-items-center">
            <Settings className="h-5 w-5 text-slate-600" aria-hidden="true" />
          </span>
          Email settings
        </button>
      </div>
    </PhoneSheet>
  );
}

/** Gmail's extended compose button, folding to its icon while the list scrolls down. */
export function ComposeFab({ compact, onClick }: { compact: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Compose"
      onClick={onClick}
      className={`c-bevel-primary absolute bottom-[calc(1rem+var(--safe-b))] right-4 z-20 flex h-14 items-center justify-center overflow-hidden rounded-2xl bg-wine-600 text-[15px] font-semibold text-white shadow-pop transition-[width,padding] duration-200 active:bg-wine-700 ${
        compact ? "w-14 px-0" : "w-[9.5rem] px-5"
      }`}
    >
      <Pencil className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span
        aria-hidden="true"
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ${
          compact ? "ml-0 max-w-0 opacity-0" : "ml-2.5 max-w-[5rem] opacity-100"
        }`}
      >
        Compose
      </span>
    </button>
  );
}
