"use client";

import { useState } from "react";
import { Mail, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  COMPANY_FIELD_LABEL,
  DEFAULT_COMPANY_NAME,
  REPLY_IDENTITIES,
  SOCIAL_PLATFORMS,
  type ClientLogo,
  type CompanySignatureSettings,
  type Office,
  type ReplyIdentity,
  type SeoSettings,
  type SiteSettings,
  type SocialPlatform,
  companySignatureGaps,
  isAdminRole,
  listWords,
  renderSignature,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useSession } from "@/lib/admin/hooks";
import ImagePicker from "@/components/admin/ImagePicker";
import { MailDeliveryCard } from "@/components/admin/MailDeliveryCard";
import { SaveBar } from "@/components/admin/SaveBar";
import { SignatureEditor } from "@/components/admin/mail/SignatureEditor";
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
  PhoneField,
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
  seo: SeoSettings;
  emailSignature: CompanySignatureSettings;
}

/** Field labels only. What is stored is the whole URL. */
const SOCIAL_LABEL: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  threads: "Threads",
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
    seo: s.seo,
    emailSignature: s.emailSignature,
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
  const { session } = useSession();
  const me = session.status === "signed-in" ? session.user : null;

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

  // The team's standard signature, redrawn from the fields on this page as they change.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const sig = draft.emailSignature;
  const office = draft.offices[0]?.address ?? "";
  const teamStandard = renderSignature(
    { name: draft.teamName, title: "", phone: draft.contactPhone, email: draft.contactEmail },
    {
      name: sig.companyName,
      phone: draft.contactPhone,
      email: draft.contactEmail,
      officeAddress: office,
      website: sig.website || origin,
      logoUrl: sig.logoUrl,
      assetOrigin: origin,
    },
  );
  const sigGaps = companySignatureGaps({
    officeAddress: office,
    website: sig.website,
    phone: draft.contactPhone,
    email: draft.contactEmail,
  });
  const setSig = (next: Partial<CompanySignatureSettings>) => set("emailSignature", { ...sig, ...next });

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

            <Field
              label="Phone"
              hint="Shown on the contact page as a tap-to-call link."
              as="group"
            >
              <PhoneField
                value={draft.contactPhone}
                onChange={(next) => set("contactPhone", next)}
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

            {/* `wa.me` wants bare digits and the field speaks E.164, so the
                plus is dropped on the way in and put back on the way out.
                Picking the country is the same act here as anywhere else. */}
            <Field
              label="WhatsApp"
              hint="Most property conversations here start on WhatsApp."
              as="group"
            >
              <PhoneField
                value={draft.whatsappNumber === "" ? "" : `+${toWhatsappDigits(draft.whatsappNumber)}`}
                onChange={(next) => set("whatsappNumber", toWhatsappDigits(next))}
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

          {/* Sits beside the social profiles rather than in a tab of its own,
              because it answers the same question they do: where this company
              appears when somebody goes looking for it. */}
          <Card className="space-y-4">
            <CardHead title="Being found in search" />
            <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
              Both of these are done at Google and recorded here. What you paste
              is what the site publishes, so a made up value does not mark the
              job done, it publishes something that fails.
            </p>

            <Field
              label="Google verification code"
              hint="Search Console hands you an HTML tag when you add the site. Paste the whole tag or just the code inside it. Until this is set, nothing reports which searches reach you."
            >
              <input
                className={inputClass}
                value={draft.seo.googleVerification}
                onChange={(event) =>
                  set("seo", { ...draft.seo, googleVerification: event.target.value })
                }
              />
            </Field>

            <Field
              label="Google Business Profile"
              hint="The public link to your map listing. It is what puts a call button and directions beside your name, and it joins the record the site publishes about the company."
            >
              <input
                className={inputClass}
                type="url"
                inputMode="url"
                value={draft.seo.googleBusinessProfileUrl}
                placeholder="https://maps.app.goo.gl/..."
                onChange={(event) =>
                  set("seo", { ...draft.seo, googleBusinessProfileUrl: event.target.value })
                }
              />
            </Field>
          </Card>

          <section id="offices" className="scroll-mt-24">
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

          </section>

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

          <section id="email-signature" className="scroll-mt-24">
            <Card className="space-y-4">
              <CardHead title="Email signature" icon={Mail} />
              <p className="-mt-1 text-[12px] leading-relaxed text-slate-600">
                Every email AV Homes sends ends with a signature. Each person&apos;s is built
                from their profile and these details; mail nobody signs, like invites,
                sign-in codes, newsletters and team replies, uses the team signature below.
                Phone, email and office come from the cards above.
              </p>
              {sigGaps.length > 0 && (
                <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-950">
                  Signatures are missing your {listWords(sigGaps.map((f) => COMPANY_FIELD_LABEL[f]))}. Emails still
                  go out, without {sigGaps.length === 1 ? "that line" : "those lines"}.
                </p>
              )}
              <Field label="Company name" hint={`Shown beside every job title. Empty uses ${DEFAULT_COMPANY_NAME}.`}>
                <input
                  className={inputClass}
                  value={sig.companyName}
                  placeholder={DEFAULT_COMPANY_NAME}
                  onChange={(event) => setSig({ companyName: event.target.value })}
                />
              </Field>
              <Field label="Website" hint="The link at the foot of every signature. Empty links this site's own address.">
                <input
                  className={inputClass}
                  type="url"
                  inputMode="url"
                  value={sig.website}
                  placeholder="https://www.avhomesltd.com"
                  onChange={(event) => setSig({ website: event.target.value })}
                />
              </Field>
              <Field label="Signature logo" hint="Optional. A square image works best; it is drawn as a circle. Empty uses the round AV Homes logo." as="group">
                <ImagePicker
                  value={sig.logoUrl ? [sig.logoUrl] : []}
                  onChange={(urls) => setSig({ logoUrl: urls[0] ?? "" })}
                  max={1}
                  coverLabel="Signature logo"
                />
              </Field>
              <Field label="Team signature" as="group">
                <SignatureEditor
                  name="team-signature"
                  value={sig.team}
                  onChange={(team) => setSig({ team })}
                  standard={teamStandard}
                  standardLabel="Use the AV Homes signature"
                  standardBlurb="The team name and the company's details, kept up to date when they change."
                />
              </Field>
            </Card>
          </section>

          {/* Owner and developer only, the same line the server draws. */}
          {me && isAdminRole(me.role) && (
            <div id="email-delivery" className="scroll-mt-24">
              <MailDeliveryCard defaultTestTo={me.email} />
            </div>
          )}
        </div>
      </PageColumns>
    </>
  );
}
