import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock, ChevronDown } from "lucide-react";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Contact | AVHomes",
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-mist-200 bg-white px-4 py-3 text-sm text-navy-950 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-600";
const labelClass = "block text-sm font-semibold text-navy-950";

export default function ContactPage() {
  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            Contact
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
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
            <form className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-8 lg:p-10">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="full-name" className={labelClass}>
                    Full name
                  </label>
                  <input
                    id="full-name"
                    name="fullName"
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Adaeze Okafor"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="email" className={labelClass}>
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="phone" className={labelClass}>
                    Phone number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+234 800 000 0000"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="enquiry-type" className={labelClass}>
                    Enquiry type
                  </label>
                  <div className="relative mt-2">
                    <select
                      id="enquiry-type"
                      name="enquiryType"
                      required
                      defaultValue=""
                      className="w-full appearance-none rounded-xl border border-mist-200 bg-white px-4 py-3 pr-10 text-sm text-navy-950 outline-none transition-colors focus:border-blue-600"
                    >
                      <option value="" disabled>
                        Select an option
                      </option>
                      <option value="general">General enquiry</option>
                      <option value="viewing">Book a viewing</option>
                      <option value="sell">Sell my property</option>
                      <option value="rent">Rent out my property</option>
                      <option value="partnership">Partnership</option>
                    </select>
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                      <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="property-interest" className={labelClass}>
                  Property of interest
                </label>
                <input
                  id="property-interest"
                  name="propertyInterest"
                  type="text"
                  placeholder="Listing title, reference, or area (optional)"
                  className={fieldClass}
                />
              </div>

              <div className="mt-5">
                <label htmlFor="message" className={labelClass}>
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={5}
                  placeholder="Tell us what you are looking for, or how we can help."
                  className={`${fieldClass} resize-none`}
                />
              </div>

              <button
                type="submit"
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:w-auto"
              >
                Send message
              </button>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                This form is not wired up on the demo site. To reach the team directly, email{" "}
                <a
                  href="mailto:hello@avhomes.com"
                  className="font-semibold text-blue-600 transition-colors hover:text-blue-700"
                >
                  hello@avhomes.com
                </a>
                .
              </p>
            </form>
          </Reveal>

          <Reveal delay={80} className="lg:col-span-2">
            <div className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-8">
              <h2 className="text-lg font-bold tracking-tight text-navy-950">
                Visit Or Reach Us Directly
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Prefer to talk it through? Our advisors are available across both offices
                during business hours.
              </p>

              <div className="mt-6 space-y-5">
                <div className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <MapPin className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-950">Lagos Office</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      12 Admiralty Way, Lekki Phase 1, Lagos
                    </p>
                  </div>
                </div>

                <div className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <MapPin className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-950">Abuja Office</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      9 Gana Street, Maitama, Abuja
                    </p>
                  </div>
                </div>

                <div className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Phone className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-950">Phone</p>
                    <a
                      href="tel:+2348000000000"
                      className="mt-0.5 block text-sm text-muted-foreground transition-colors hover:text-blue-600"
                    >
                      +234 800 000 0000
                    </a>
                  </div>
                </div>

                <div className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Mail className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-950">Email</p>
                    <a
                      href="mailto:hello@avhomes.com"
                      className="mt-0.5 block text-sm text-muted-foreground transition-colors hover:text-blue-600"
                    >
                      hello@avhomes.com
                    </a>
                  </div>
                </div>

                <div className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <Clock className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-950">Office Hours</p>
                    <div className="mt-0.5 space-y-0.5 text-sm leading-relaxed text-muted-foreground">
                      <p>Monday to Friday: 9am to 6pm</p>
                      <p>Saturday: 10am to 4pm</p>
                      <p>Sunday: Closed</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={140} className="mt-10">
          <div className="flex h-72 items-center justify-center rounded-2xl border border-mist-200 bg-mist-50 px-6 text-center">
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              An interactive map of our Lagos and Abuja offices will appear here once the site
              is connected to a maps provider.
            </p>
          </div>
        </Reveal>
      </div>
    </>
  );
}
