import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock, MessageCircle } from "lucide-react";
import Reveal from "@/components/Reveal";
import ContactForm from "@/components/ContactForm";
import { getSiteSettings, whatsappHref } from "@/lib/data";

export const metadata: Metadata = {
  title: "Contact | AVHomes",
};

export default async function ContactPage() {
  /*
   * Every block below is CONDITIONAL on a stored value. This page used to print
   * a phone number of +234 800 000 0000, two invented office addresses and a
   * note to the developer about a maps provider, all of which a visitor read as
   * evidence that nobody was home. Nothing renders here that somebody has not
   * actually entered in the console.
   */
  const site = await getSiteSettings();
  const whatsapp = whatsappHref(
    site.whatsappNumber,
    "Hi, I found you on avhomes. I would like to ask about a property.",
  );
  const hasAny =
    site.offices.length > 0 ||
    site.contactPhone !== "" ||
    site.contactEmail !== "" ||
    whatsapp !== null;

  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-wine-600">
            Contact
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-plum-950 sm:text-4xl lg:text-5xl">
            Talk To Us About Your <span className="accent">Next Move</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Whether you are searching for a new home, listing a property to sell, or exploring
            a partnership, our Lagos and Abuja teams are ready to help. Send a message and we
            will respond within one business day.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-10">
          <Reveal className="lg:col-span-3">
            <ContactForm contactEmail={site.contactEmail} />
          </Reveal>

          <Reveal delay={80} className="lg:col-span-2">
            <div className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-8">
              <h2 className="text-lg font-bold tracking-tight text-plum-950">
                Visit Or Reach Us Directly
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Prefer to talk it through? Our advisors are available across both offices
                during business hours.
              </p>

              {hasAny ? (
                <div className="mt-6 space-y-5">
                  {site.offices.map((office) => (
                    <div key={`${office.label}-${office.address}`} className="flex gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-50">
                        <MapPin className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-plum-950">{office.label}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {office.address}
                        </p>
                      </div>
                    </div>
                  ))}

                  {site.contactPhone !== "" && (
                    <div className="flex gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-50">
                        <Phone className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-plum-950">Phone</p>
                        <a
                          href={`tel:${site.contactPhone.replace(/\s+/g, "")}`}
                          className="mt-0.5 block text-sm text-muted-foreground transition-colors hover:text-wine-600"
                        >
                          {site.contactPhone}
                        </a>
                      </div>
                    </div>
                  )}

                  {whatsapp && (
                    <div className="flex gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-50">
                        <MessageCircle className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-plum-950">WhatsApp</p>
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 block text-sm text-muted-foreground transition-colors hover:text-wine-600"
                        >
                          Start a chat
                        </a>
                      </div>
                    </div>
                  )}

                  {site.contactEmail !== "" && (
                    <div className="flex gap-3.5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-50">
                        <Mail className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-plum-950">Email</p>
                        <a
                          href={`mailto:${site.contactEmail}`}
                          className="mt-0.5 block text-sm text-muted-foreground transition-colors hover:text-wine-600"
                        >
                          {site.contactEmail}
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine-50">
                      <Clock className="h-4 w-4 text-wine-600" strokeWidth={1.8} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-plum-950">Office Hours</p>
                      <div className="mt-0.5 space-y-0.5 text-sm leading-relaxed text-muted-foreground">
                        <p>Monday to Friday: 9am to 6pm</p>
                        <p>Saturday: 10am to 4pm</p>
                        <p>Sunday: Closed</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* No stored contact details yet. Saying so plainly beats an
                   empty panel with a heading over it, and the form beside this
                   still works. */
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  The form is the fastest way to reach us right now, and it goes
                  straight to the team.
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
