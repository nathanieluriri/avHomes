import type { Metadata } from "next";
import UnsubscribeConfirm from "./UnsubscribeConfirm";

export const metadata: Metadata = {
  title: "Unsubscribe | AVHomes",
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; t?: string }>;
}) {
  const { s = "", t = "" } = await searchParams;
  return <UnsubscribeConfirm subscriberId={s} token={t} />;
}
