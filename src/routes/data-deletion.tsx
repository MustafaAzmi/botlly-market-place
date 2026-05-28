import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "Data Deletion Instructions | Botly" },
      {
        name: "description",
        content: "How to request deletion of Botly account, storefront, WhatsApp, and customer lead data.",
      },
    ],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion Instructions"
      updatedAt="Last updated: May 28, 2026"
      intro="You can request deletion of Botly account data, storefront data, WhatsApp integration data, and related customer lead records using the steps below."
      sections={[
        {
          title: "How to Request Deletion",
          body: "Send an email to botlly.bot@gmail.com with the subject line: Data Deletion Request. Include your store name, account email or phone number, and a short confirmation that you want your Botly data deleted.",
        },
        {
          title: "What We Delete",
          body: "After verification, we delete or anonymize merchant profile data, storefront configuration, product catalog data, WhatsApp webhook records, leads, and other operational records associated with your account where legally and technically possible.",
        },
        {
          title: "Verification",
          body: "We may ask for additional information to confirm that the request comes from the account owner or an authorized representative.",
        },
        {
          title: "Processing Time",
          body: "We aim to process valid deletion requests within 30 days unless a longer period is required for legal, security, fraud prevention, or accounting reasons.",
        },
        {
          title: "Contact",
          body: "For data deletion requests, contact botlly.bot@gmail.com.",
        },
      ]}
    />
  );
}
