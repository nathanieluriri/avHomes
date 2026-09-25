"use client";

import { useRouter } from "next/navigation";
import { Check, Settings } from "lucide-react";
import type { MailboxSummary } from "@avhomes/contracts";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { Badge } from "@/components/admin/ui";
import { MenuLabel, MenuRow, MenuSeparator, initialOf, kb } from "./shared";

function Avatar({ address, size = "md" }: { address: string; size?: "md" | "sm" }) {
  const box = size === "md" ? "h-9 w-9 text-[14px]" : "h-8 w-8 text-[12px]";
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-wine-600 font-semibold text-white ${box}`}
    >
      {initialOf(address)}
    </span>
  );
}

function usage(m: MailboxSummary): string {
  const q = m.quota;
  if (!q || !q.supported) return "Storage use not reported";
  return `${kb(q.storageUsedKb)} of ${kb(q.storageLimitKb)} used`;
}

/** The avatar in the corner that lists every mailbox the key reaches. */
export function AccountSwitcher({
  mailboxes,
  current,
  senderId,
  onPick,
}: {
  mailboxes: MailboxSummary[];
  current: string;
  senderId: string;
  onPick: (id: string) => void;
}) {
  const router = useRouter();
  const active = mailboxes.find((m) => m.resourceId === current) ?? mailboxes[0];

  const trigger = (
    <button
      type="button"
      aria-label={`Mailbox: ${active.address}. Switch mailbox`}
      title={active.address}
      className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-full transition-shadow hover:ring-4 hover:ring-mist-200 sm:h-10 sm:w-10"
    >
      <Avatar address={active.address} />
    </button>
  );

  return (
    <ResponsiveMenu
      trigger={trigger}
      title="Mailboxes"
      align="end"
      widthClassName="w-80"
      items={(kind) => (
        <>
          <MenuLabel>Mailboxes this key reaches</MenuLabel>
          {mailboxes.map((m) => {
            const here = m.resourceId === active.resourceId;
            const q = m.quota;
            const percent = q && q.supported && q.storageLimitKb > 0 ? Math.min(100, (q.storageUsedKb / q.storageLimitKb) * 100) : 0;
            return (
              <MenuRow key={m.resourceId} kind={kind} current={here} onSelect={() => onPick(m.resourceId)}>
                <Avatar address={m.address} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-plum-950">{m.address}</span>
                  {q && q.supported && (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-mist-200">
                      <span
                        className={`block h-full rounded-full ${percent > 90 ? "bg-red-600" : "bg-wine-600"}`}
                        style={{ width: `${Math.max(percent, 1)}%` }}
                      />
                    </span>
                  )}
                  <span className="mt-1 block truncate text-[11.5px] font-normal text-slate-600">{usage(m)}</span>
                  {m.resourceId === senderId && (
                    <span className="mt-1 block">
                      <Badge tone="wine">Sends site mail</Badge>
                    </span>
                  )}
                </span>
                {here && <Check className="h-4 w-4 shrink-0 text-wine-600" aria-label="Current mailbox" />}
              </MenuRow>
            );
          })}
          <MenuSeparator kind={kind} />
          <MenuRow kind={kind} onSelect={() => router.push("/admin/settings")}>
            <Settings className="h-4 w-4 text-slate-550" aria-hidden="true" />
            Email settings
          </MenuRow>
        </>
      )}
    />
  );
}
