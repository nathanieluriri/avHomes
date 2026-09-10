"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  REPLY_IDENTITIES,
  SOCIAL_PLATFORMS,
  type ClientLogo,
  type Office,
  type ReplyIdentity,
  type SiteSettings,
  type SocialPlatform,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import ImagePicker from "@/components/admin/ImagePicker";
import { SaveBar } from "@/components/admin/SaveBar";
import {
  Button,
  Card,
  CardHead,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  PageColumns,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * Site settings. Today that means one decision: whose name answers a buyer.
 *
 * It is a real decision rather than a preference. An agency with staff turnover
 * does not want a buyer building a relationship with a name that leaves, and a
 * small team that trades on knowing people personally wants exactly the
 * opposite. Both are correct; only the site can say which it is.
 */

const CHOICES: Record<ReplyIdentity, { label: string; blurb: string }> = {
  individual: {
    label: "The person replying",
    blurb:
      "Each reply is signed with the name and photo of whoever wrote it. Best when buyers should know their consultant by name.",
  },
  team: {
    label: "One team name",
    blurb:
      "Every reply is signed with the name below, whoever typed it. Best when enquiries are worked from a shared queue, or when staff change.",
  },
};

interface Draft {
  replyIdentity: ReplyIdentity;
  teamName: string;
  teamAvatarUrl: string;
  contactPhone: string;
  contactEmail: string;
  whatsappNumber: string;
  offices: Office[];
  clientLogos: ClientLogo[];
  social: Record<SocialPlatform, string>;
}

/** Field labels only. What is stored is the whole URL. */
const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
};

function toDraft(s: SiteSettings): Draft {
  return {
    replyIdentity: s.replyIdentity,
    teamName: s.teamName,
    teamAvatarUrl: s.teamAvatarUrl,
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    whatsappNumber: s.whatsappNumber,
    offices: s.offices,
    clientLogos: s.clientLogos,
    social: s.social,
  };
}

/**
 * `wa.me` takes digits, and a person types a phone number.
 *
 * Stripping on the way in rather than validating and refusing: everyone writes
 * `+234 801 234 5678`, nobody writes `2348012345678`, and a settings screen that
 * rejects the format printed on a business card is a settings screen that gets
 * left empty. A leading `00` is the same intent as a `+`.
 */
function toWhatsappDigits(input: string): string {
  const digits = input.replace(/[^0-9]/gu, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

export default function SettingsPage() {
  const { data, error, loading, reload } = useAsync<{ settings: SiteSettings }>(
    (signal) => api.get<{ settings: SiteSettings }>("/admin/settings", signal),
    [],
  );

  if (loading) {
    return (
      <>
        <PageHeader icon={SlidersHorizontal} title="Settings" />
        <div aria-busy="true">
          <span className="sr-only">Loading settings</span>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader icon={SlidersHorizontal} title="Settings" />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }
  if (!data) return null;

  return <SettingsEditor initial={data.settings} />;
}

function SettingsEditor({ initial }: { initial: SiteSettings }) {
  const [saved, setSaved] = useState<SiteSettings>(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ settings: SiteSettings }>("/admin/settings", draft);
      setSaved(res.settings);
      setDraft(toDraft(res.settings));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, { error: "upstream_failed", detail: String(err) }),
      );
    } finally {
      setBusy(false);
    }
  }

  const isTeam = draft.replyIdentity === "team";

  return (
    <>
      <SaveBar
        when={dirty}
        saving={busy}
        onDiscard={() => {
          setDraft(toDraft(saved));
          setError(null);
        }}
        onSave={() => void save()}
      />

      <PageHeader
        icon={SlidersHorizontal}
        title="Settings"
        subtitle="How the site behaves for everyone."
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}

      {/* `asideFirstOnMobile`, because the aside is a live preview of the team
          name being typed two cards below it. Collapsed the old way it landed
          last on a phone, which put it under the on-screen keyboard: the one
          element that reflects what you are typing was the one element you
          could not see while typing. */}
      <PageColumns
        asideFirstOnMobile
        aside={
          <aside>
            <Card>
              <CardHead title="How a reply appears" />
              <div className="rounded-xl bg-mist-50 p-3">
                <div className="rounded-2xl bg-wine-600 px-3.5 py-2.5 text-[13px] leading-relaxed text-white">
                  Happy to arrange a viewing this week. Which day suits you?
                </div>
                <p className="mt-1 text-right text-[11px] text-slate-550">
                  {isTeam ? draft.teamName || "Your team name" : "Whoever replied"}
                </p>
              </div>
            </Card>
          </aside>
        }
      >
        <div className="space-y-4">
          <Card>
            <CardHead title="Who answers an enquiry" />
            <p className="mb-3 text-[12px] leading-relaxed text-slate-600">
              This changes the name on new replies only. Messages a buyer has
              already read, and transcripts already in their inbox, keep the name
              they were sent with.
            </p>

            {/* Radios, not a switch. Two named outcomes with a paragraph each is
                not an on/off state, and a switch would force the reader to work
                out what "off" means. */}
            <div className="space-y-2">
              {REPLY_IDENTITIES.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                    draft.replyIdentity === value
                      ? "border-wine-500 bg-wine-50/50"
                      : "border-mist-200 hover:bg-mist-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="replyIdentity"
                    value={value}
                    checked={draft.replyIdentity === value}
                    onChange={() => set("replyIdentity", value)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-plum-950">
                      {CHOICES[value].label}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-600">
                      {CHOICES[value].blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          {/* Revealed only when it does something. A team name field under an
              "individual" setting is a control with no effect, and one of those
              on screen teaches people that the settings do not do anything. */}
          <Card className="space-y-4">
            <CardHead title="How buyers reach you" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              Every field here is empty until you fill it, and the public site
              hides the block rather than printing something that looks real. A
              site with no phone number reads better than a site with a fake one.
            </p>

            <Field label="Phone" hint="Shown on the contact page as a tap-to-call link.">
              <input
                className={inputClass}
                inputMode="tel"
                value={draft.contactPhone}
                placeholder="+234 801 234 5678"
                onChange={(event) => set("contactPhone", event.target.value)}
              />
            </Field>

            <Field label="Email" hint="Shown on the contact page and in the footer.">
              <input
                className={inputClass}
                type="email"
                value={draft.contactEmail}
                placeholder="hello@yourdomain.com"
                onChange={(event) => set("contactEmail", event.target.value)}
              />
            </Field>

            <Field
              label="WhatsApp"
              hint="Country code first. Most property conversations here start on WhatsApp."
            >
              <input
                className={inputClass}
                inputMode="tel"
                value={draft.whatsappNumber}
                placeholder="2348012345678"
                onChange={(event) => set("whatsappNumber", toWhatsappDigits(event.target.value))}
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <CardHead title="Social profiles" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              The full URL of each profile. An icon is drawn only for the ones
              you fill in, so leaving one empty hides it rather than linking
              somewhere that is not yours.
            </p>
            {SOCIAL_PLATFORMS.map((platform) => (
              <Field key={platform} label={SOCIAL_LABEL[platform]}>
                <input
                  className={inputClass}
                  type="url"
                  inputMode="url"
                  value={draft.social[platform]}
                  placeholder="https://..."
                  onChange={(event) =>
                    set("social", { ...draft.social, [platform]: event.target.value })
                  }
                />
              </Field>
            ))}
          </Card>

          <Card className="space-y-4">
            <CardHead
              title="Offices"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => set("offices", [...draft.offices, { label: "", address: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  Add
                </Button>
              }
            />
            {draft.offices.length === 0 ? (
              <EmptyState
                bare
                title="No office published"
                hint="A visitor has no way to check there is a real place behind the site."
              />
            ) : (
              draft.offices.map((office, index) => (
                <div key={index} className="rounded-xl border border-mist-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Office {index + 1}
                    </span>
                    <IconButton
                      label={`Remove office ${index + 1}`}
                      icon={Trash2}
                      size="dense"
                      variant="danger"
                      onClick={() =>
                        set(
                          "offices",
                          draft.offices.filter((_, i) => i !== index),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <input
                      className={inputClass}
                      value={office.label}
                      placeholder="Lagos"
                      aria-label={`Office ${index + 1} name`}
                      onChange={(event) =>
                        set(
                          "offices",
                          draft.offices.map((o, i) =>
                            i === index ? { ...o, label: event.target.value } : o,
                          ),
                        )
                      }
                    />
                    <input
                      className={inputClass}
                      value={office.address}
                      placeholder="14 Admiralty Way, Lekki Phase 1"
                      aria-label={`Office ${index + 1} address`}
                      onChange={(event) =>
                        set(
                          "offices",
                          draft.offices.map((o, i) =>
                            i === index ? { ...o, address: event.target.value } : o,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card className="space-y-4">
            <CardHead
              title="Clients you can name"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    set("clientLogos", [...draft.clientLogos, { name: "", imageUrl: "" }])
                  }
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                  Add
                </Button>
              }
            />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              One client you can actually show beats five you cannot. A row with
              no logo is not rendered on the site, so the strip never falls back
              to a line of plain scrolling text.
            </p>
            {draft.clientLogos.length === 0 ? (
              <EmptyState
                bare
                title="No clients named"
                hint="The trust strip on the homepage stays hidden until there is one."
              />
            ) : (
              draft.clientLogos.map((client, index) => (
                <div key={index} className="rounded-xl border border-mist-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Client {index + 1}
                    </span>
                    <IconButton
                      label={`Remove client ${index + 1}`}
                      icon={Trash2}
                      size="dense"
                      variant="danger"
                      onClick={() =>
                        set(
                          "clientLogos",
                          draft.clientLogos.filter((_, i) => i !== index),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <input
                      className={inputClass}
                      value={client.name}
                      placeholder="Sahara Group"
                      aria-label={`Client ${index + 1} name`}
                      onChange={(event) =>
                        set(
                          "clientLogos",
                          draft.clientLogos.map((c, i) =>
                            i === index ? { ...c, name: event.target.value } : c,
                          ),
                        )
                      }
                    />
                    <Field label="Logo" as="group">
                      <ImagePicker
                        value={client.imageUrl ? [client.imageUrl] : []}
                        onChange={(urls) =>
                          set(
                            "clientLogos",
                            draft.clientLogos.map((c, i) =>
                              i === index ? { ...c, imageUrl: urls[0] ?? "" } : c,
                            ),
                          )
                        }
                        max={1}
                        coverLabel="Logo"
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
          </Card>

          {isTeam && (
            <Card className="space-y-4">
              <Field label="Team name" hint="What a buyer sees instead of a person's name.">
                <input
                  className={inputClass}
                  value={draft.teamName}
                  placeholder="AV Constructions team"
                  onChange={(event) => set("teamName", event.target.value)}
                />
              </Field>
              {/* `as="group"`, not a label. ImagePicker owns a hidden file
                  input, and a bare label forwards a tap on any of its own
                  whitespace to the first labelable descendant, so tapping the
                  hint line or the photo itself opened the camera roll. */}
              <Field
                label="Team photo"
                hint="Optional. Falls back to the first letter."
                as="group"
              >
                <ImagePicker
                  value={draft.teamAvatarUrl ? [draft.teamAvatarUrl] : []}
                  onChange={(urls) => set("teamAvatarUrl", urls[0] ?? "")}
                  max={1}
                  coverLabel="Team photo"
                />
              </Field>
            </Card>
          )}
        </div>
      </PageColumns>
    </>
  );
}
