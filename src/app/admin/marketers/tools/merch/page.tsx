"use client";

import { Award, Shirt } from "lucide-react";
import { formatPrice, parseMajor, plainMajor, type MarketingTools, type MerchGrade, type MerchItem } from "@avhomes/contracts";
import ImagePicker from "@/components/admin/ImagePicker";
import { Card, CardHead, ErrorNote, Field, Switch, inputClass } from "@/components/admin/ui";
import { ToolsHeader, newToolId } from "@/components/admin/tools/ToolsTabs";
import { ToolListEditor, ToolsLoading, useTools } from "@/components/admin/tools/ToolList";

const SALE = { listingType: "sale", rentPeriod: null } as const;

function dealsLine(n: number): string {
  return n === 0 ? "Every partner" : `${n}+ approved deal${n === 1 ? "" : "s"}`;
}

export default function MerchPage() {
  const { data, error, reload, setData } = useTools();
  return (
    <>
      <ToolsHeader subtitle="Branded kit partners can ask for. Each item belongs to a grade, reached by approved deals." />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <ToolsLoading />}
      {data && (
        <div className="space-y-8">
          <Card>
            <CardHead title="Grades" />
            <p className="-mt-1 mb-4 text-[13px] text-slate-600">
              A partner reaches a grade with enough approved deals, and can ask for anything in that grade or below.
            </p>
            <ToolListEditor
              list="grades"
              noun="Grade"
              icon={Award}
              tools={data}
              onSaved={setData}
              title={(g) => g.name}
              meta={(g) => `${dealsLine(g.minDeals)} · ${itemCount(data, g.id)}${g.includes ? ` · ${g.includes}` : ""}`}
              blank={(): MerchGrade => ({ id: newToolId("grade"), name: "", includes: "", minDeals: 0 })}
              ready={(g) => g.name.trim() !== ""}
              emptyHint="Add a grade, such as Standard, Premium or Elite."
              form={(g, set) => (
                <>
                  <Field label="Name">
                    <input className={inputClass} maxLength={60} value={g.name} onChange={(e) => set({ name: e.target.value })} />
                  </Field>
                  <Field label="Approved deals needed" hint="Zero means every partner starts here.">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={g.minDeals}
                      onChange={(e) => set({ minDeals: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    />
                  </Field>
                  <Field label="What it includes" hint="One line partners read before they ask.">
                    <textarea
                      className={`${inputClass} resize-none`}
                      rows={3}
                      maxLength={400}
                      value={g.includes}
                      onChange={(e) => set({ includes: e.target.value })}
                    />
                  </Field>
                </>
              )}
            />
          </Card>

          <Card>
            <CardHead title="Items" />
            <ToolListEditor
              list="merch"
              noun="Item"
              icon={Shirt}
              tools={data}
              onSaved={setData}
              title={(m) => m.name}
              meta={(m) =>
                [
                  data.grades.find((g) => g.id === m.gradeId)?.name ?? "No grade",
                  m.priceMinor > 0 ? formatPrice(m.priceMinor, SALE) : "Free",
                  m.stock === null ? "" : `${m.stock} in stock`,
                  m.sizes.length > 0 ? m.sizes.join(", ") : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              blank={(): MerchItem => ({
                id: newToolId("merch"),
                name: "",
                summary: "",
                imageUrl: "",
                gradeId: data.grades[0]?.id ?? "",
                priceMinor: 0,
                sizes: [],
                stock: null,
                hidden: false,
              })}
              ready={(m) => m.name.trim() !== "" && data.grades.some((g) => g.id === m.gradeId)}
              emptyHint="Add a shirt, a cap, flyers or anything else partners can ask for."
              form={(m, set) => <ItemForm item={m} grades={data.grades} set={set} />}
            />
          </Card>
        </div>
      )}
    </>
  );
}

function itemCount(tools: MarketingTools, gradeId: string): string {
  const n = tools.merch.filter((m) => m.gradeId === gradeId).length;
  return `${n} item${n === 1 ? "" : "s"}`;
}

function ItemForm({ item, grades, set }: { item: MerchItem; grades: MerchGrade[]; set: (patch: Partial<MerchItem>) => void }) {
  return (
    <>
      <Field label="Name">
        <input className={inputClass} maxLength={140} value={item.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Description" hint="Optional.">
        <input className={inputClass} maxLength={400} value={item.summary} onChange={(e) => set({ summary: e.target.value })} />
      </Field>
      <Field label="Grade">
        <select className={inputClass} value={item.gradeId} onChange={(e) => set({ gradeId: e.target.value })}>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({dealsLine(g.minDeals).toLowerCase()})
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Price" hint="Leave empty if it is free.">
          <input
            className={inputClass}
            inputMode="decimal"
            defaultValue={item.priceMinor > 0 ? plainMajor(item.priceMinor) : ""}
            placeholder="Free"
            onChange={(e) => {
              const parsed = parseMajor(e.target.value || "0");
              if (parsed.ok) set({ priceMinor: parsed.minor });
            }}
          />
        </Field>
        <Field label="In stock" hint="Leave empty if you do not count it.">
          <input
            className={inputClass}
            type="number"
            min={0}
            inputMode="numeric"
            value={item.stock ?? ""}
            onChange={(e) => set({ stock: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          />
        </Field>
      </div>
      <Field label="Sizes" hint="Separated by commas, such as S, M, L, XL. Leave empty for one size.">
        <input
          className={inputClass}
          defaultValue={item.sizes.join(", ")}
          onChange={(e) =>
            set({
              sizes: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 12),
            })
          }
        />
      </Field>
      <Field label="Photo" hint="Optional." as="group">
        <ImagePicker value={item.imageUrl ? [item.imageUrl] : []} onChange={(urls) => set({ imageUrl: urls[0] ?? "" })} max={1} coverLabel="Photo" />
      </Field>
      <Switch checked={!item.hidden} onChange={(shown) => set({ hidden: !shown })} label="Show to partners" />
    </>
  );
}
