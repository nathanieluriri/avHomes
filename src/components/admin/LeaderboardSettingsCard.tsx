"use client";

import {
  BOARD_METRICS,
  BOARD_METRIC_LABEL,
  BOARD_PERIODS,
  BOARD_PERIOD_LABEL,
  BOARD_SCOPES,
  BOARD_SCOPE_LABEL,
  normalizeLeaderboardSettings,
  type LeaderboardSettings,
} from "@avhomes/contracts";
import { Card, CardHead, Field, Switch, inputClass } from "@/components/admin/ui";

/** What partners may see and filter on the app's leaderboard. */
export function LeaderboardSettingsCard({
  value,
  onChange,
}: {
  value: LeaderboardSettings;
  onChange: (next: LeaderboardSettings) => void;
}) {
  const set = (patch: Partial<LeaderboardSettings>) => onChange(normalizeLeaderboardSettings({ ...value, ...patch }));
  const toggle = <T extends string>(list: T[], item: T, all: readonly T[]): T[] => {
    const next = list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
    return all.filter((x) => next.includes(x));
  };

  return (
    <Card className="space-y-4">
      <CardHead title="The app's leaderboard" />
      <Switch
        checked={value.enabled}
        onChange={(enabled) => set({ enabled })}
        label="Show the leaderboard in the partner app"
        description="Off hides it. Partners still see their own numbers."
      />

      {value.enabled && (
        <>
          <Chips
            label="What partners can rank by"
            hint="Commission earned shows what other partners were paid, so it starts off."
            all={BOARD_METRICS}
            labels={BOARD_METRIC_LABEL}
            on={value.metrics}
            onToggle={(item) => set({ metrics: toggle(value.metrics, item, BOARD_METRICS) })}
          />
          <Chips
            label="Periods they can pick"
            all={BOARD_PERIODS}
            labels={BOARD_PERIOD_LABEL}
            on={value.periods}
            onToggle={(item) => set({ periods: toggle(value.periods, item, BOARD_PERIODS) })}
          />
          <Chips
            label="Who they can compare with"
            all={BOARD_SCOPES}
            labels={BOARD_SCOPE_LABEL}
            on={value.scopes}
            onToggle={(item) => set({ scopes: toggle(value.scopes, item, BOARD_SCOPES) })}
          />
          <Switch
            checked={value.stateFilter}
            onChange={(stateFilter) => set({ stateFilter })}
            label="Let partners filter by state"
            description="Uses the state each partner put on their profile."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Opens on">
              <select
                className={inputClass}
                value={value.defaultMetric}
                onChange={(event) => set({ defaultMetric: event.target.value as LeaderboardSettings["defaultMetric"] })}
              >
                {value.metrics.map((item) => (
                  <option key={item} value={item}>
                    {BOARD_METRIC_LABEL[item]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="For">
              <select
                className={inputClass}
                value={value.defaultPeriod}
                onChange={(event) => set({ defaultPeriod: event.target.value as LeaderboardSettings["defaultPeriod"] })}
              >
                {value.periods.map((item) => (
                  <option key={item} value={item}>
                    {BOARD_PERIOD_LABEL[item]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </>
      )}
    </Card>
  );
}

function Chips<T extends string>({
  label,
  hint,
  all,
  labels,
  on,
  onToggle,
}: {
  label: string;
  hint?: string;
  all: readonly T[];
  labels: Record<T, string>;
  on: readonly T[];
  onToggle: (item: T) => void;
}) {
  return (
    <Field label={label} hint={hint} as="group">
      <div className="flex flex-wrap gap-1.5">
        {all.map((item) => {
          const active = on.includes(item);
          const last = active && on.length === 1;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              disabled={last}
              title={last ? "At least one has to stay on" : undefined}
              onClick={() => onToggle(item)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed ${
                active ? "bg-wine-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {labels[item]}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
