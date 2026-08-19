import type { Metadata } from "next";
import LegalPage, { LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | AVHomes",
};

const sections: LegalSection[] = [
  { id: "what-we-collect", label: "What Information We Collect" },
  { id: "how-we-collect", label: "How We Collect Information" },
  { id: "how-we-use-it", label: "How We Use Your Information" },
  { id: "legal-basis", label: "Our Legal Basis for Processing" },
  { id: "cookies", label: "Cookies and Similar Technologies" },
  { id: "sharing", label: "Who We Share Data With" },
  { id: "retention", label: "Data Retention" },
  { id: "security", label: "How We Protect Your Information" },
  { id: "your-rights", label: "Your Rights Under Nigerian Law" },
  { id: "children", label: "Children’s Privacy" },
  { id: "international-transfers", label: "International Data Transfers" },
  { id: "contact-dpo", label: "Contact Our Data Protection Officer" },
];

const heading = "text-xl font-bold tracking-tight text-navy-950 sm:text-2xl";
const body = "mt-4 space-y-4 text-base leading-relaxed text-ink/80";
const list = "mt-4 space-y-3 text-base leading-relaxed text-ink/80";
const dot = "mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="12 August 2026" sections={sections}>
      <section id="what-we-collect" className="scroll-mt-28">
        <h2 className={heading}>1. What Information We Collect</h2>
        <div className={body}>
          <p>
            We collect information you provide directly, such as your name, email address, and
            phone number when you submit an enquiry or a viewing request. If you create an
            account, we also store your saved searches and any properties you shortlist.
          </p>
          <p>
            We collect information about your search and viewing preferences, such as the
            locations, property types, and price ranges you filter by, so that we can show you
            more relevant listings. We also collect device and usage data, including your
            browser type, screen size, pages visited, and an approximate location derived from
            your IP address.
          </p>
        </div>
      </section>

      <section id="how-we-collect" className="scroll-mt-28">
        <h2 className={heading}>2. How We Collect Information</h2>
        <div className={body}>
          <p>
            Most information is collected directly from you, through contact forms, viewing
            requests, account registration, and newsletter sign ups. We also collect
            information automatically through cookies and similar technologies as you browse
            the Service, described in the Cookies section below.
          </p>
          <p>
            Where a partner agent refers an enquiry to us, or where you contact an agent
            directly about one of our listings, that agent may share the details you provided
            so that we can respond to you on their behalf.
          </p>
        </div>
      </section>

      <section id="how-we-use-it" className="scroll-mt-28">
        <h2 className={heading}>3. How We Use Your Information</h2>
        <div className={body}>
          <p>
            We use your information to operate the Service, including matching you with
            relevant listings, forwarding your enquiries and viewing requests to the
            appropriate agent, responding to your questions, and sending updates you have
            opted into, such as new listing alerts.
          </p>
          <p>
            We also use aggregated, de identified usage data to understand how the Service is
            used, improve site performance, and decide which features and property types to
            prioritise.
          </p>
        </div>
      </section>

      <section id="legal-basis" className="scroll-mt-28">
        <h2 className={heading}>4. Our Legal Basis for Processing</h2>
        <div className={body}>
          <p>
            We process your personal data on the following legal bases: performance of a
            contract, or steps you ask us to take before entering one, such as arranging a
            viewing; our legitimate interest in operating and improving the Service; your
            consent, for example when you opt in to marketing communications or non essential
            cookies; and compliance with a legal obligation, where one applies.
          </p>
          <p>
            Where consent is our basis for processing, you may withdraw it at any time without
            affecting the lawfulness of processing carried out before the withdrawal.
          </p>
        </div>
      </section>

      <section id="cookies" className="scroll-mt-28">
        <h2 className={heading}>5. Cookies and Similar Technologies</h2>
        <div className={body}>
          <p>
            We use cookies and similar technologies to run the Service and to understand how it
            is used. Cookies on AVHomes fall into three categories.
          </p>
        </div>
        <ul className={list}>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Strictly necessary cookies</strong>{" "}
              are required for core functionality, such as remembering your filter selections
              during a session and keeping the Service secure. These cannot be switched off.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Analytics cookies</strong> help us
              understand aggregate visitor behaviour, such as which listings and pages are
              viewed most often, so that we can improve the Service. These are only set with
              your consent.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Marketing cookies</strong> may be
              used to show more relevant AVHomes messaging on other platforms and to measure the
              effectiveness of our campaigns. These are only set with your consent and can be
              withdrawn at any time through your cookie preferences.
            </span>
          </li>
        </ul>
      </section>

      <section id="sharing" className="scroll-mt-28">
        <h2 className={heading}>6. Who We Share Data With</h2>
        <div className={body}>
          <p>
            We share your enquiry details with the specific agent, agency, or property owner
            responsible for a listing you have enquired about or asked to view, so that they
            can respond to you directly.
          </p>
          <p>
            We also share data with trusted service providers who support our operations, such
            as hosting providers, email delivery services, and analytics providers, under
            agreements that require them to protect your data and use it only for the purposes
            we specify. We do not sell your personal data to third parties.
          </p>
        </div>
      </section>

      <section id="retention" className="scroll-mt-28">
        <h2 className={heading}>7. Data Retention</h2>
        <div className={body}>
          <p>
            We retain personal data for as long as necessary to fulfil the purposes described
            in this policy, including any applicable legal, accounting, or reporting
            requirements. Enquiry and viewing request records are typically kept for up to
            twenty four months after your last interaction with us, after which they are
            deleted or anonymised unless a longer period is required by law.
          </p>
        </div>
      </section>

      <section id="security" className="scroll-mt-28">
        <h2 className={heading}>8. How We Protect Your Information</h2>
        <div className={body}>
          <p>
            We apply administrative, technical, and physical safeguards designed to protect
            your personal data against unauthorised access, alteration, disclosure, or
            destruction, including encrypted data transmission and access controls that limit
            who within AVHomes can view enquiry data.
          </p>
          <p>
            No method of transmission or storage is completely secure. While we work hard to
            protect your information, we cannot guarantee its absolute security.
          </p>
        </div>
      </section>

      <section id="your-rights" className="scroll-mt-28">
        <h2 className={heading}>9. Your Rights Under the Nigeria Data Protection Act</h2>
        <div className={body}>
          <p>
            Under the Nigeria Data Protection Act 2023, you have the following rights over the
            personal data we hold about you.
          </p>
        </div>
        <ul className={list}>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Access.</strong> Request a copy of
              the personal data we hold about you.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Correction.</strong> Ask us to
              correct inaccurate or incomplete data.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Deletion.</strong> Ask us to
              delete data we no longer have a valid reason to keep.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Objection.</strong> Object to or
              request that we restrict certain processing of your data.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={dot} aria-hidden="true" />
            <span>
              <strong className="font-semibold text-navy-950">Portability.</strong> Request your
              data in a structured, commonly used, machine readable format.
            </span>
          </li>
        </ul>
        <div className={body}>
          <p>
            To exercise any of these rights, contact our Data Protection Officer using the
            details below. We will respond within the timeframe required by applicable law. You
            also have the right to lodge a complaint with the Nigeria Data Protection Commission
            if you believe your data has been mishandled.
          </p>
        </div>
      </section>

      <section id="children" className="scroll-mt-28">
        <h2 className={heading}>10. Children&rsquo;s Privacy</h2>
        <div className={body}>
          <p>
            The Service is not directed at children under the age of 18, and we do not
            knowingly collect personal data from children. If you believe a child has provided
            us with personal data, please contact us so that we can delete it.
          </p>
        </div>
      </section>

      <section id="international-transfers" className="scroll-mt-28">
        <h2 className={heading}>11. International Data Transfers</h2>
        <div className={body}>
          <p>
            Some of our service providers, such as cloud hosting and analytics platforms, may
            process data outside Nigeria. Where this happens, we take steps to ensure an
            adequate level of protection is applied, consistent with the requirements of the
            Nigeria Data Protection Act 2023, including the use of contractual safeguards with
            those providers.
          </p>
        </div>
      </section>

      <section id="contact-dpo" className="scroll-mt-28">
        <h2 className={heading}>12. Contact Our Data Protection Officer</h2>
        <div className={body}>
          <p>
            For any question about this Privacy Policy, or to exercise your data protection
            rights, contact our Data Protection Officer at dpo@avhomes.com, or by post at 12
            Admiralty Way, Lekki Phase 1, Lagos, Nigeria.
          </p>
        </div>
      </section>
    </LegalPage>
  );
}
