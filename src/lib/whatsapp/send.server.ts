// Shared WhatsApp Business API sender.
//
// Single integration point for outbound WhatsApp text — used by the bot webhook
// (customer replies + lead notifications) and the admin messaging tools
// (broadcasts + individual merchant messages). There is no separate messaging
// system; everything goes through this one Graph API call.

function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN;
}

function getWhatsAppPhoneNumberId() {
  return process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.META_WHATSAPP_PHONE_NUMBER_ID;
}

export type SendResult = { ok: boolean; status: number; error?: string };

export async function sendWhatsAppText(
  to: string,
  body: string,
  phoneNumberId?: string,
): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const pnId = phoneNumberId || getWhatsAppPhoneNumberId();
  if (!accessToken || !pnId) {
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }

  const response = await fetch(`https://graph.facebook.com/v24.0/${pnId}/messages`, {
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
  return {
    ok: false,
    status: response.status,
    error: await response.text().catch(() => "Unknown WhatsApp API error"),
  };
}

export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  phoneNumberId?: string,
): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const pnId = phoneNumberId || getWhatsAppPhoneNumberId();
  if (!accessToken || !pnId) {
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }

  const response = await fetch(`https://graph.facebook.com/v24.0/${pnId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title },
          })),
        },
      },
    }),
  });

  if (response.ok) return { ok: true, status: response.status };
  return {
    ok: false,
    status: response.status,
    error: await response.text().catch(() => "Unknown WhatsApp API error"),
  };
}

// Send a product image with an optional caption. WhatsApp requires a PUBLIC
// https URL — data: URLs (manually uploaded images stored as base64) cannot be
// sent and the caller must skip them.
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string,
  phoneNumberId?: string,
): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const pnId = phoneNumberId || getWhatsAppPhoneNumberId();
  if (!accessToken || !pnId) {
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }
  if (!/^https:\/\//i.test(imageUrl)) {
    return { ok: false, status: 0, error: "Image URL must be public https" };
  }

  const response = await fetch(`https://graph.facebook.com/v24.0/${pnId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: caption ? { link: imageUrl, caption } : { link: imageUrl },
    }),
  });

  if (response.ok) return { ok: true, status: response.status };
  return {
    ok: false,
    status: response.status,
    error: await response.text().catch(() => "Unknown WhatsApp API error"),
  };
}

