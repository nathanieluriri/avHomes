import type { Metadata } from "next";
import LegalPage, { LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms and Conditions | AVHomes",
};

const sections: LegalSection[] = [
  { id: "acceptance", label: "Acceptance of These Terms" },
  { id: "accounts", label: "Accounts and Registration" },
  { id: "listings", label: "Property Listings and Accuracy" },
  { id: "no-agency", label: "No Agency or Brokerage Relationship" },
  { id: "viewings", label: "Viewings and Appointments" },
  { id: "fees", label: "Fees and Payments" },
  { id: "intellectual-property", label: "Intellectual Property" },
  { id: "prohibited-conduct", label: "Prohibited Conduct" },
  { id: "third-party-links", label: "Third Party Links" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "governing-law", label: "Governing Law and Jurisdiction" },
  { id: "changes", label: "Changes to These Terms" },
];

const heading = "text-xl font-bold tracking-tight text-plum-950 sm:text-2xl";
const body = "mt-4 space-y-4 text-base leading-relaxed text-ink/80";

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" lastUpdated="12 August 2026" sections={sections}>
      <section id="acceptance" className="scroll-mt-28">
        <h2 className={heading}>1. Acceptance of These Terms</h2>
        <div className={body}>
          <p>
            By accessing or using the AVHomes website and any related services (the
            &ldquo;Service&rdquo;), you agree to be bound by these Terms and Conditions
            (&ldquo;Terms&rdquo;). If you do not agree with any part of these Terms, please do
            not use the Service.
          </p>
          <p>
            The Service is intended for individuals who are at least 18 years old and who have
            the legal capacity to enter into binding agreements under the laws of the Federal
            Republic of Nigeria. If you are using the Service on behalf of a company or other
            organisation, you confirm that you have the authority to bind that organisation to
            these Terms.
          </p>
        </div>
      </section>

      <section id="accounts" className="scroll-mt-28">
        <h2 className={heading}>2. Accounts and Registration</h2>
        <div className={body}>
          <p>
            Certain features, such as saving favourite listings or requesting a viewing, may
            require you to create an account or submit your contact details. You agree to
            provide accurate, current, and complete information, and to keep that information
            up to date.
          </p>
          <p>
            You are responsible for maintaining the confidentiality of any login credentials
            associated with your account and for all activity that takes place under it.
            Notify us promptly at hello@avhomes.com if you suspect any unauthorised use of your
            account.
          </p>
        </div>
      </section>

      <section id="listings" className="scroll-mt-28">
        <h2 className={heading}>3. Property Listings and Accuracy of Information</h2>
        <div className={body}>
          <p>
            AVHomes and its partner agents make reasonable efforts to ensure that property
            listings, including photographs, floor areas, pricing, and availability, are
            accurate at the time of publication. Listings are supplied by third party agents
            and by our internal team and may occasionally contain errors or become outdated
            between updates.
          </p>
          <p>
            All prices are quoted in Nigerian Naira (NGN) unless stated otherwise and are
            subject to change without notice. A published price, availability status, or
            description does not constitute an offer capable of acceptance. Any transaction
            remains subject to independent verification, a physical inspection, and a formal
            contract between the relevant parties.
          </p>
        </div>
      </section>

      <section id="no-agency" className="scroll-mt-28">
        <h2 className={heading}>4. No Agency or Brokerage Relationship</h2>
        <div className={body}>
          <p>
            Use of the Service does not, by itself, create an agency, brokerage, or fiduciary
            relationship between you and AVHomes. AVHomes operates as a listings platform that
            connects prospective buyers, tenants, and sellers with independent property owners
            and registered agents.
          </p>
          <p>
            Any agency or brokerage relationship is formed separately and directly with the
            relevant agent or agency, and is governed by that agent&rsquo;s own terms of
            engagement. AVHomes is not a party to, and accepts no liability arising from, the
            negotiation or execution of any sale, lease, or tenancy agreement between users of
            the Service.
          </p>
        </div>
      </section>

      <section id="viewings" className="scroll-mt-28">
        <h2 className={heading}>5. Viewings and Appointments</h2>
        <div className={body}>
          <p>
            Viewing requests submitted through the Service are forwarded to the listing agent,
            who will confirm a date and time directly with you. AVHomes does not guarantee that
            a requested viewing slot will be available and is not responsible for an
            agent&rsquo;s failure to attend or confirm an appointment.
          </p>
          <p>
            Please arrive on time and treat every property, its occupants, and its neighbours
            with respect. AVHomes reserves the right to decline to arrange further viewings for
            any user who behaves inappropriately during a visit.
          </p>
        </div>
      </section>

      <section id="fees" className="scroll-mt-28">
        <h2 className={heading}>6. Fees and Payments</h2>
        <div className={body}>
          <p>
            Browsing listings and submitting enquiries through the Service is free of charge.
            Where a paid service is offered, such as a featured listing placement for agents,
            the applicable fee will be clearly disclosed in Naira before you are asked to pay.
          </p>
          <p>
            AVHomes does not collect rent, sale proceeds, deposits, or agency commissions on
            behalf of any party through this website. Any such payment is arranged directly
            between you and the relevant agent, landlord, or seller, and you should
            independently verify payment details before transferring any funds.
          </p>
        </div>
      </section>

      <section id="intellectual-property" className="scroll-mt-28">
        <h2 className={heading}>7. Intellectual Property</h2>
        <div className={body}>
          <p>
            The Service, including its design, layout, text, graphics, logos, and the AVHomes
            name and mark, is owned by or licensed to AVHomes and is protected by Nigerian and
            international intellectual property law. Property photographs remain the property
            of the agent or owner who supplied them.
          </p>
          <p>
            You may view and print pages of the Service for personal, non commercial use only.
            You may not reproduce, republish, scrape, or distribute any part of the Service
            without our prior written consent.
          </p>
        </div>
      </section>

      <section id="prohibited-conduct" className="scroll-mt-28">
        <h2 className={heading}>8. Prohibited Conduct</h2>
        <div className={body}>
          <p>
            You agree not to misuse the Service. This includes posting false or misleading
            listing information, attempting to bypass an agent to avoid a legitimate fee,
            scraping or harvesting data with automated tools, uploading malicious code, or
            using the Service for any unlawful purpose.
          </p>
          <p>
            AVHomes may suspend or terminate access for any user reasonably believed to be in
            breach of this section, with or without prior notice.
          </p>
        </div>
      </section>

      <section id="third-party-links" className="scroll-mt-28">
        <h2 className={heading}>9. Third Party Links</h2>
        <div className={body}>
          <p>
            The Service may contain links to third party websites, such as mortgage
            calculators, mapping tools, or partner agency pages. These links are provided for
            convenience only. AVHomes does not control and is not responsible for the content,
            accuracy, or privacy practices of any third party site.
          </p>
        </div>
      </section>

      <section id="liability" className="scroll-mt-28">
        <h2 className={heading}>10. Limitation of Liability</h2>
        <div className={body}>
          <p>
            The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
            basis. To the fullest extent permitted by Nigerian law, AVHomes disclaims all
            warranties, express or implied, regarding the accuracy, completeness, or
            availability of listing information.
          </p>
          <p>
            AVHomes will not be liable for any indirect, incidental, or consequential loss
            arising from your use of the Service, including loss arising from reliance on
            listing details that later prove inaccurate, or from any dispute between a user and
            an agent, landlord, or seller.
          </p>
        </div>
      </section>

      <section id="governing-law" className="scroll-mt-28">
        <h2 className={heading}>11. Governing Law and Jurisdiction</h2>
        <div className={body}>
          <p>
            These Terms are governed by and construed in accordance with the laws of the
            Federal Republic of Nigeria. Any dispute arising out of or in connection with these
            Terms, or your use of the Service, is subject to the exclusive jurisdiction of the
            courts of Lagos State.
          </p>
        </div>
      </section>

      <section id="changes" className="scroll-mt-28">
        <h2 className={heading}>12. Changes to These Terms</h2>
        <div className={body}>
          <p>
            We may update these Terms from time to time to reflect changes in our Service or in
            applicable law. The &ldquo;Last updated&rdquo; date at the top of this page changes
            whenever we do, and material changes will be highlighted on this page for a
            reasonable period afterward. Continued use of the Service after a change takes
            effect constitutes your acceptance of the revised Terms.
          </p>
        </div>
      </section>
    </LegalPage>
  );
}
