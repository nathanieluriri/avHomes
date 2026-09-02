import { getEnv } from "./env";
import { NotImplementedError, UpstreamError } from "./errors";

/**
 * Outbound mail as a PORT, not an import.
 *
 * Two routes here send mail: an invite, and an enquiry notification. Neither can
 * be tested by having the route return what it would have sent, so the transport
 * is a seam in the type and a suite supplies a recorder.
 *
 * `assertConfigured` is asked SEPARATELY from `send`, because "this deployment
 * has no mail provider" is not an incident and must not be logged as one, while
 * "the provider refused" is.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface Mailer {
  assertConfigured(): void;
  send(message: MailMessage): Promise<void>;
}

/**
 * The default. It throws on `assertConfigured`, so a caller that asks first gets
 * a clean "not configured" and a caller that does not gets a loud failure rather
 * than a silent drop.
 *
 * A LoggingMailer that quietly succeeded is how a complete transactional outbox
 * delivered nothing for months in the system this design is modelled on.
 */
export function unconfiguredMailer(): Mailer {
  return {
    assertConfigured() {
      throw new NotImplementedError("mail", "set RESEND_API_KEY and MAIL_FROM");
    },
    async send() {
      throw new NotImplementedError("mail", "set RESEND_API_KEY and MAIL_FROM");
    },
  };
}

/**
 * Resend over its REST API rather than its SDK.
 *
 * One fetch call is the whole integration, and avoiding the dependency avoids
 * the module-format hazard that class of package keeps producing under a
 * bundler. Reads its environment at SEND time, so importing this module still
 * demands no mail configuration.
 */
export function resendMailer(): Mailer {
  function config(): { key: string; from: string } {
    const env = getEnv();
    if (env.RESEND_API_KEY === "" || env.MAIL_FROM === "") {
      throw new NotImplementedError("mail", "set RESEND_API_KEY and MAIL_FROM");
    }
    return { key: env.RESEND_API_KEY, from: env.MAIL_FROM };
  }

  return {
    assertConfigured() {
      config();
    },
    async send(message) {
      const { key, from } = config();
      let res: Response;
      try {
        res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
            ...(message.replyTo ? { reply_to: [message.replyTo] } : {}),
          }),
        });
      } catch (err) {
        throw new UpstreamError("resend", err instanceof Error ? err.message : "network failure");
      }
      if (!res.ok) {
        // The body carries Resend's own reason, which is the difference between
        // "your domain is not verified" and an unexplained 4xx.
        const detail = await res.text().catch(() => "");
        throw new UpstreamError("resend", `${res.status} ${detail.slice(0, 300)}`);
      }
    },
  };
}

/**
 * Sends without letting a mail failure fail the request that triggered it.
 *
 * Returns whether it went. An invite is the only way a second person reaches an
 * invite-only instance, so making it depend on a working mail provider means a
 * mail outage locks the team out of growing.
 */
export async function trySend(
  mailer: Mailer,
  message: MailMessage,
  ctx: { requestId: string; route: string },
): Promise<boolean> {
  try {
    mailer.assertConfigured();
  } catch {
    return false; // Not configured is not an incident.
  }
  try {
    await mailer.send(message);
    return true;
  } catch (err) {
    // NAME AND MESSAGE ONLY. An error object can carry the request that held it,
    // and that request body has an address and sometimes a token in it.
    console.error(
      "[api]",
      JSON.stringify({
        requestId: ctx.requestId,
        route: ctx.route,
        name: err instanceof Error ? err.name : typeof err,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}
