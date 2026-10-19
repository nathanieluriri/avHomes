"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { Crown } from "lucide-react";
import {
  BOARD_METRIC_LABEL,
  BOARD_PERIOD_LABEL,
  BOARD_SCOPE_LABEL,
  type BoardMetric,
  type BoardPeriod,
  type BoardRow,
  type BoardScope,
  type LeaderboardResponse,
} from "@avhomes/contracts";
import { AppShell } from "@/components/marketer/AppShell";
import { IconTrophy } from "@/components/marketer/icons3d";
import { Avatar, Pills } from "@/components/marketer/insights/bits";
import {
  ButtonLink,
  EmptyState,
  ErrorNote,
  Money,
  RowGroup,
  Segmented,
  Skeleton,
  inputCls,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";

interface Filters {
  period: BoardPeriod | "";
  metric: BoardMetric | "";
  scope: BoardScope | "";
  state: string;
}

export default function LeaderboardPage() {
  const [filters, setFilters] = useState<Filters>({ period: "", metric: "", scope: "", state: "" });
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value !== "") as [string, string][],
  ).toString();
  const board = useAsync(
    (signal) => api.get<LeaderboardResponse>(`/marketing/leaderboard${query ? `?${query}` : ""}`, signal),
    [query],
    { keepPrevious: true, cache: "leaderboard" },
  );
  const data = board.data;
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((was) => ({ ...was, [key]: value }));

  return (
    <AppShell title="Leaderboard" back="/m" hero={<Hero data={data} />} tab="Top partners">
      <div className="space-y-4 px-4 pb-24">
        {board.error && <ErrorNote error={board.error} onRetry={board.reload} />}
        {!data && !board.error && <BoardSkeleton />}
        {data && !data.enabled && (
          <EmptyState
            art={<IconTrophy size={96} />}
            title="The leaderboard is resting"
            hint="AV Homes has turned it off for now. Your own numbers are always on My numbers."
            action={<ButtonLink href="/m/analytics">See my numbers</ButtonLink>}
          />
        )}
        {data?.enabled && (
          <>
            <FilterBar data={data} onChange={set} />
            <Board data={data} />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Hero({ data }: { data: LeaderboardResponse | null }) {
  if (!data) return <Skeleton onWine className="mt-4 h-[72px]" radius="18px" />;
  if (!data.enabled) return null;
  const me = data.me;
  return (
    <div className="m-glass mt-4 flex items-center gap-3 rounded-[18px] px-4 py-3">
      <IconTrophy size={44} className="-my-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-white/80">
          {data.period.label} · {BOARD_METRIC_LABEL[data.metric]}
        </p>
        <p className="text-[17px] font-bold leading-snug text-white">
          {me && me.rank > 0 ? (
            <>
              You are <span className="m-num">#{me.rank}</span> of {data.total}
            </>
          ) : (
            "Close a deal to get on the board"
          )}
        </p>
      </div>
      {me && me.rank > 0 && (
        <span className="m-num shrink-0 text-right text-[15px] font-bold text-white">
          <Figure metric={data.metric} value={me.value} currency={data.currency} />
        </span>
      )}
    </div>
  );
}

function FilterBar({
  data,
  onChange,
}: {
  data: LeaderboardResponse;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}) {
  const s = data.settings;
  return (
    <section aria-label="Filters" className="space-y-3">
      {s.metrics.length > 1 && (
        <Pills
          label="Ranked by"
          value={data.metric}
          options={s.metrics.map((value) => ({ value, label: BOARD_METRIC_LABEL[value] }))}
          onChange={(value) => onChange("metric", value)}
        />
      )}
      {s.periods.length > 1 && (
        <Pills
          label="Period"
          value={data.period.key}
          options={s.periods.map((value) => ({ value, label: BOARD_PERIOD_LABEL[value] }))}
          onChange={(value) => onChange("period", value)}
        />
      )}
      {(s.scopes.length > 1 || (s.stateFilter && data.states.length > 1)) && (
        <div className="flex gap-2">
          {s.scopes.length > 1 && (
            <Segmented
              className="flex-1"
              label="Who"
              value={data.scope}
              options={s.scopes.map((value) => ({ value, label: BOARD_SCOPE_LABEL[value] }))}
              onChange={(value) => onChange("scope", value)}
            />
          )}
          {s.stateFilter && data.states.length > 1 && (
            <label className="w-[42%] shrink-0">
              <span className="sr-only">State</span>
              <select
                className={`${inputCls} h-11 py-0 text-[14px]`}
                value={data.state}
                onChange={(event) => onChange("state", event.target.value)}
              >
                <option value="">All states</option>
                {data.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </section>
  );
}

function Figure({ metric, value, currency }: { metric: BoardMetric; value: number; currency: string }) {
  if (metric === "value" || metric === "commission") return <Money minor={value} currency={currency} size="sm" />;
  const unit = metric === "deals" ? (value === 1 ? "deal" : "deals") : value === 1 ? "person" : "people";
  return (
    <>
      {value} <span className="text-[12px] font-medium opacity-75">{unit}</span>
    </>
  );
}

function Board({ data }: { data: LeaderboardResponse }) {
  const mineRef = useRef<HTMLDivElement>(null);
  const [mineVisible, setMineVisible] = useState(true);
  const onBoard = data.rows.some((row) => row.isMe);

  useEffect(() => {
    const node = mineRef.current;
    if (!node) {
      setMineVisible(false);
      return;
    }
    const watch = new IntersectionObserver(([entry]) => setMineVisible(entry?.isIntersecting ?? false), {
      rootMargin: "0px 0px -120px 0px",
    });
    watch.observe(node);
    return () => watch.disconnect();
  }, [data]);

  if (data.rows.length === 0) {
    return (
      <EmptyState
        compact
        art={<IconTrophy size={64} />}
        title="Nobody is on the board yet"
        hint={`Nothing counted for ${data.period.label.toLowerCase()} so far. The first deal takes first place.`}
      />
    );
  }

  const podium = data.rows.slice(0, 3);
  const rest = data.rows.slice(3);

  return (
    <>
      <Podium rows={podium} data={data} mineRef={mineRef} />
      {rest.length > 0 && (
        <RowGroup>
          {rest.map((row) => (
            <Row key={row.marketerId} row={row} data={data} rowRef={row.isMe ? mineRef : undefined} />
          ))}
        </RowGroup>
      )}
      {data.total > data.rows.length && (
        <p className="px-1 text-center text-[12px] text-m-muted">
          Showing the top {data.rows.length} of {data.total}.
        </p>
      )}
      {data.me && (!onBoard || !mineVisible) && (
        <div
          className="fixed inset-x-0 z-30 mx-auto max-w-[30rem] px-4"
          style={{ bottom: "calc(var(--m-bar-h) + var(--safe-b) + 0.75rem)" }}
        >
          <div className="m-card overflow-hidden ring-2 ring-[#ff8fa3]">
            <Row row={data.me} data={data} />
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  row,
  data,
  rowRef,
}: {
  row: BoardRow;
  data: LeaderboardResponse;
  rowRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-3 px-4 py-3 ${row.isMe ? "bg-[rgb(255_143_163/0.1)]" : ""}`}
    >
      <span className="m-num w-7 shrink-0 text-center text-[15px] font-bold text-m-muted">
        {row.rank > 0 ? row.rank : "–"}
      </span>
      <Avatar name={row.name} code={row.code} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-m-text">
          {row.isMe ? "You" : row.name}
        </span>
        <span className="block truncate text-[12px] text-m-muted">
          {[row.code, row.state].filter(Boolean).join(" · ")}
          {data.metric !== "deals" && row.deals > 0 && ` · ${row.deals} ${row.deals === 1 ? "deal" : "deals"}`}
        </span>
      </span>
      <span className="m-num shrink-0 text-right text-[15px] font-bold text-m-text">
        <Figure metric={data.metric} value={row.value} currency={data.currency} />
      </span>
    </div>
  );
}

const PLACE = {
  1: { height: "h-28", ring: "ring-[#f5cf73]", medal: "bg-[#f5cf73] text-[#3a2912]", size: 64 },
  2: { height: "h-20", ring: "ring-[#dde0e8]", medal: "bg-[#dde0e8] text-[#2c1b20]", size: 54 },
  3: { height: "h-14", ring: "ring-[#d99a6a]", medal: "bg-[#d99a6a] text-[#2c1b20]", size: 54 },
} as const;

/** Second, first, third: the order a podium is read in. */
function Podium({
  rows,
  data,
  mineRef,
}: {
  rows: BoardRow[];
  data: LeaderboardResponse;
  mineRef: Ref<HTMLDivElement>;
}) {
  const order = [rows[1], rows[0], rows[2]];
  return (
    <section aria-label="Top three" className="m-card px-3 pb-0 pt-5">
      <ol className="grid grid-cols-3 items-end gap-2">
        {order.map((row, index) => {
          if (!row) return <li key={`gap-${index}`} />;
          const place = PLACE[(Math.min(row.rank, 3) as 1 | 2 | 3)] ?? PLACE[3];
          return (
            <li key={row.marketerId} className="flex min-w-0 flex-col items-center text-center">
              <div ref={row.isMe ? mineRef : undefined} className="relative">
                {row.rank === 1 && (
                  <Crown
                    className="absolute -top-5 left-1/2 h-5 w-5 -translate-x-1/2 fill-[#f5cf73] text-[#f5cf73]"
                    aria-hidden
                  />
                )}
                <Avatar name={row.name} code={row.code} size={place.size} className={`ring-[3px] ${place.ring}`} />
                <span
                  className={`m-num absolute -bottom-1.5 left-1/2 grid h-6 min-w-6 -translate-x-1/2 place-items-center rounded-full px-1.5 text-[12px] font-bold ${place.medal}`}
                >
                  {row.rank}
                </span>
              </div>
              <span className="mt-3 w-full truncate text-[13px] font-semibold text-m-text">
                {row.isMe ? "You" : row.name.split(/\s+/u)[0]}
              </span>
              <span className="m-num text-[13px] font-bold text-m-text">
                <Figure metric={data.metric} value={row.value} currency={data.currency} />
              </span>
              <span
                className={`mt-2 w-full rounded-t-[14px] ${place.height} ${
                  row.rank === 1
                    ? "bg-[linear-gradient(180deg,#c24a6b_0%,#5a2336_100%)]"
                    : "bg-[linear-gradient(180deg,#3a2630_0%,#23151b_100%)]"
                } ${row.isMe ? "ring-2 ring-[#ff8fa3]" : ""}`}
                aria-hidden
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <Skeleton className="h-9" radius="999px" />
      <Skeleton className="h-9" radius="999px" />
      <Skeleton className="h-56" radius="22px" />
      <Skeleton className="h-40" radius="22px" />
    </div>
  );
}
