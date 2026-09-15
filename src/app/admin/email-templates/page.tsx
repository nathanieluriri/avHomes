"use client";

import Link from "next/link";
import { ChevronRight, MailOpen, MailPlus } from "lucide-react";
import { EMAIL_TEMPLATES, type EmailTemplate } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { MailNotConfiguredAlert } from "@/components/admin/MailStatus";
import { Badge, ButtonLink, ErrorNote, PageHeader, Skeleton } from "@/components/admin/ui";

export default function EmailTemplatesPage() {
  const { data, error, loading, reload } = useAsync<{ items: EmailTemplate[] }>(
    (signal) => api.get<{ items: EmailTemplate[] }>("/admin/email-templates", signal),
    [],
  );

  return (
    <>
      <PageHeader
        title="Email templates"
        icon={MailOpen}
        subtitle="The wording of every email the site sends. Open one to edit it and preview the result."
        actions={
          <ButtonLink href="/admin/email-templates/requests" variant="ghost">
            <MailPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Request a new template
          </ButtonLink>
        }
      />
      <MailNotConfiguredAlert />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-64" />}
      <ul className="flex flex-col gap-2">
        {data?.items.map((template) => {
          const info = EMAIL_TEMPLATES[template.key];
          return (
            <li key={template.key}>
              <Link
                href={`/admin/email-templates/${template.key}`}
                className="group flex items-center gap-4 rounded-xl border border-mist-200 bg-white px-4 py-3.5 transition-colors hover:border-wine-500 focus-visible:border-wine-500"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-plum-950">{info.label}</span>
                  <span className="mt-0.5 block text-[13px] text-slate-600">{info.when}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">Subject: {template.subject}</span>
                </span>
                <Badge tone={template.customised ? "wine" : "neutral"}>
                  {template.customised
                    ? `Edited${template.updatedAt ? ` ${shortDate(template.updatedAt)}` : ""}`
                    : "Default"}
                </Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
