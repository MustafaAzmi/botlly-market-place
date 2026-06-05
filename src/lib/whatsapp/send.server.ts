// Shared WhatsApp Business API sender.
//
// Single integration point for outbound WhatsApp text — used by the bot webhook
// (customer replies + lead notifications) and the admin messaging tools
// (broadcasts + individual merchant messages). There is no separate messaging
// system; everything goes through this one Graph API call.

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || /^<.*>$/.test(trimmed)) return undefined;
  return trimmed;
}

function getWhatsAppAccessToken() {
  return cleanEnv(process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN);
}

function getWhatsAppPhoneNumberId() {
  return cleanEnv(
    process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID,
  );
}

export type SendResult = { ok: boolean; status: number; error?: string };

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = getWhatsAppPhoneNumberId();
  if (!accessToken || !phoneNumberId) {
    console.error("[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }

  const response = await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (response.ok) return { ok: true, status: response.status };
  const error = await response.text().catch(() => "Unknown WhatsApp API error");
  console.error("[WhatsApp] Graph API send failed:", response.status, error);
  return {
    ok: false,
    status: response.status,
    error,
  };
}
