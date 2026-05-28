import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Botly" },
      {
        name: "description",
        content: "Terms of Service for Botly, an AI WhatsApp commerce platform for merchants.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updatedAt="Last updated: May 28, 2026"
      intro="These terms explain how merchants and visitors may use Botly services, including storefronts, WhatsApp automation, dashboard tools, and related integrations."
      sections={[
        {
          title: "Use of Botly",
          body: "Botly is provided to help merchants manage product catalogs, receive customer leads, and connect commerce workflows with WhatsApp. You are responsible for the accuracy of your store information, product listings, prices, and customer communications.",
        },
        {
          title: "Merchant Responsibilities",
          body: "You must only publish lawful products and content. You must have permission to contact customers through WhatsApp and comply with WhatsApp Business, Meta, local commerce, privacy, and consumer protection rules.",
        },
        {
          title: "Integrations",
          body: "Botly may connect with services such as Meta WhatsApp Business Platform, Supabase, and hosting providers. Third-party services are governed by their own terms and availability.",
        },
        {
          title: "Service Changes",
          body: "We may update, pause, or modify features to improve reliability, security, or compliance. We will try to avoid unnecessary disruption to active merchants.",
        },
        {
          title: "Contact",
          body: "For support or legal questions, contact us at botlly.bot@gmail.com.",
        },
      ]}
    />
  );
}
