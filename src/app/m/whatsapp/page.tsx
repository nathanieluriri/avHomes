"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/marketer/AppShell";
import { ErrorNote, Note, PrimaryButton } from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";

/** Where the WhatsApp push lands. Push links must stay inside the app, so this hands over to the partner's /wa link. */
export default function WhatsappPage() {
  const { data, error, reload } = useAsync(
    (signal) => api.get<{ link: string | null; joined: boolean }>("/marketing/whatsapp", signal),
    [],
  );

  useEffect(() => {
    if (data?.link) window.location.replace(data.link);
  }, [data]);

  return (
    <AppShell title="WhatsApp group" hint="New listings and pay day news land there first." back="/m">
      <div className="space-y-4 px-4">
        {error && <ErrorNote error={error} onRetry={reload} />}
        {data && !data.link && <Note>There is no partners&apos; group yet. We will let you know when there is.</Note>}
        {data?.link && (
          <>
            <Note>Opening WhatsApp. If nothing happens, tap the button.</Note>
            <PrimaryButton onClick={() => window.location.assign(data.link!)}>Join the group</PrimaryButton>
          </>
        )}
      </div>
    </AppShell>
  );
}
