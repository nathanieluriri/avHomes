import type { Db } from "@avhomes/db";
import { trySend, type Mailer } from "@avhomes/core";
import type { EmailTemplateKey } from "@avhomes/contracts";

/**
 * The editable templates live in `@avhomes/settings`, which depends on this
 * package, so the app hands the renderer in rather than this package importing it.
 */
export type EmailRenderer = (
  db: Db,
  key: EmailTemplateKey,
  text: Record<string, string>,
) => Promise<{ subject: string; text: string; html: string }>;

export interface TemplateMail {
  mailer: Mailer;
  render: EmailRenderer;
}

/** Never fatal, like every send here: the change it reports has already happened. */
export async function sendTemplate(
  deps: TemplateMail,
  db: Db,
  to: string,
  key: EmailTemplateKey,
  text: Record<string, string>,
  ctx: { requestId: string; route: string },
): Promise<boolean> {
  if (to === "") return false;
  let email: Awaited<ReturnType<EmailRenderer>>;
  try {
    email = await deps.render(db, key, text);
  } catch (err) {
    console.error("[mail]", JSON.stringify({ ...ctx, template: key, message: err instanceof Error ? err.message : String(err) }));
    return false;
  }
  return trySend(deps.mailer, { to, subject: email.subject, text: email.text, html: email.html }, ctx);
}
