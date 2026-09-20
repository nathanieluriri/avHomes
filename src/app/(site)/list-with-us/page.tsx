import type { Metadata } from "next";
import { ApplyForm } from "@/components/ApplyForm";

export const metadata: Metadata = {
  title: "List your property with AV Homes",
  description:
    "Own property you want sold or let? Apply for an AV Homes account, add your own listings, and watch how they perform.",
};

/**
 * The public application.
 *
 * In the SITE's voice, not the console's: the reader is a stranger with a house,
 * not a colleague. One screen, six fields, and a plain statement of what happens
 * next, because an application with no stated outcome is one people chase by phone.
 */
export default function ListWithUsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-14 sm:py-20">
      <h1 className="font-serif text-3xl leading-tight text-plum-950 sm:text-4xl">
        List your property with AV Homes
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        If you own property you want sold or let, you can list it here yourself. You
        get an account, you add your own photos and details, and you see how many
        people looked at it and what happened next.
      </p>

      <ol className="mt-8 space-y-3 border-l-2 border-wine-100 pl-5">
        <Step n={1} title="You apply">
          The form below. It takes a minute.
        </Step>
        <Step n={2} title="We read it">
          Somebody here reads every one and you hear back either way.
        </Step>
        <Step n={3} title="You add your property">
          You get a sign-in link and add as much detail as you like.
        </Step>
        <Step n={4} title="We check it, then it goes live">
          {/* Said plainly and up front, because it is the one thing that surprises
              people later. A partner submits; AV Homes publishes. */}
          Every listing is read by AV Homes before it appears on the site. That is
          how the whole site stays worth reading.
        </Step>
      </ol>

      <div className="mt-10">
        <ApplyForm />
      </div>
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute -left-[1.6rem] flex h-5 w-5 items-center justify-center rounded-full bg-wine-600 text-[11px] font-semibold text-white"
      >
        {n}
      </span>
      <h2 className="text-[14px] font-semibold text-plum-950">{title}</h2>
      <p className="mt-0.5 text-[14px] leading-relaxed text-slate-600">{children}</p>
    </li>
  );
}
