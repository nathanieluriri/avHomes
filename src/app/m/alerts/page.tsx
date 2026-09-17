"use client";

import type { MarketerAlert, MarketerAlertTone } from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import {
  ALERT_TONES,
  ALERT_TONE_LABEL,
  AlertRow,
  AlertRowSkeleton,
  sortAlerts,
} from "@/components/marketer/alerts";
import { IconCheckBadge } from "@/components/marketer/icons3d";
import {
  Chip,
  EmptyState,
  ErrorNote,
  RowGroup,
  SectionLabel,
  type ChipTone,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import type { AlertsResponse } from "@/lib/marketer/api";

/**
 * Every alert, grouped by what it asks of the marketer: things to do, things
 * worth knowing, good news. Each row names one action and opens the screen
 * where it gets done. Called Alerts, as the Menu calls it, because it holds more
 * than what needs them.
 */

const GROUP_CHIP: Record<MarketerAlertTone, ChipTone> = {
  act: "act",
  "heads-up": "heads-up",
  good: "good",
};

/** A group's name with its count in the group's own chip colour. */
function GroupName({ tone, count }: { tone: MarketerAlertTone; count: number }) {
  return (
    <>
      {ALERT_TONE_LABEL[tone]}
      <Chip tone={GROUP_CHIP[tone]} className="m-num">
        {count}
      </Chip>
    </>
  );
}

export default function AlertsPage() {
  const alerts = useAsync((signal) => api.get<AlertsResponse>("/marketing/alerts", signal), []);

  const items = alerts.data ? sortAlerts(alerts.data.items) : [];
  const toDo = alerts.data ? items.filter((alert) => alert.tone === "act").length : undefined;
  const groups = ALERT_TONES.map((tone) => ({
    tone,
    items: items.filter((alert) => alert.tone === tone),
  })).filter((group) => group.items.length > 0);

  // The first group's name rides the tab; the rest sit in the sheet.
  const [lead, ...rest] = groups;
  const tab = lead ? (
    <GroupName tone={lead.tone} count={lead.items.length} />
  ) : alerts.loading ? (
    ALERT_TONE_LABEL.act
  ) : (
    "Right now"
  );

  return (
    <AppShell title="Alerts" back="/m" tab={tab} alertCount={toDo}>
      <div className="px-4">
        {alerts.error && <ErrorNote error={alerts.error} onRetry={alerts.reload} />}

        {!alerts.error && !alerts.data && (
          <RowGroup>
            <AlertRowSkeleton />
            <AlertRowSkeleton />
            <AlertRowSkeleton />
          </RowGroup>
        )}

        {alerts.data && !lead && (
          <EmptyState
            art={<IconCheckBadge size={88} />}
            title="You are all caught up"
            hint="When a deal needs more proof, money is sent or your bank needs checking, it shows up here."
          />
        )}

        {lead && <AlertGroup items={lead.items} />}

        {rest.map((group) => (
          <section key={group.tone} className="mt-7">
            <SectionLabel>
              <GroupName tone={group.tone} count={group.items.length} />
            </SectionLabel>
            <AlertGroup items={group.items} />
          </section>
        ))}
      </div>
    </AppShell>
  );
}

function AlertGroup({ items }: { items: readonly MarketerAlert[] }) {
  return (
    <ul className="m-card divide-y divide-m-line overflow-hidden">
      {items.map((alert) => (
        <li key={alert.id}>
          <AlertRow alert={alert} />
        </li>
      ))}
    </ul>
  );
}
