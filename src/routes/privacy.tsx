import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Botly" },
      {
        name: "description",
        content: "Privacy Policy for Botly merchant storefronts, dashboard tools, and WhatsApp integrations.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updatedAt="Last updated: May 28, 2026"
      intro="This policy describes the information Botly processes to provide merchant storefronts, dashboard features, WhatsApp automation, and related support."
      sections={[
        {
          title: "Information We Process",
          body: "We may process merchant account details, store details, product catalog data, delivery company details, customer lead information, WhatsApp message metadata, and webhook events required to operate the service.",
        },
        {
          title: "How We Use Information",
          body: "We use information to run storefronts, manage orders and leads, connect WhatsApp workflows, improve reliability, prevent abuse, provide support, and comply with legal requirements.",
        },
        {
          title: "Data Sharing",
          body: "We do not sell personal data. Data may be shared with infrastructure and integration providers needed to operate the service, such as Meta WhatsApp Business Platform, Supabase, and hosting providers.",
        },
        {
          title: "Retention",
          body: "We keep information only as long as needed for service operations, security, compliance, or merchant account management. Merchants may request deletion as described in our data deletion instructions.",
        },
        {
          title: "Contact",
          body: "For privacy questions, contact us at botlly.bot@gmail.com.",
        },
      ]}
    />
  );
}
