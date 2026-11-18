import { notFound } from "next/navigation";

import { UiTestHarness } from "./UiTestHarness";

type UiTestHarnessPageProps = {
  searchParams: Promise<{ target?: string }>;
};

export const instant = false;

export default async function UiTestHarnessPage({
  searchParams,
}: UiTestHarnessPageProps) {
  if (
    process.env.MINI_MALL_UI_TEST !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    notFound();
  }

  const { target = "" } = await searchParams;

  return <UiTestHarness target={target} />;
}
