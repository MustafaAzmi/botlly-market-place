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

const WHATSAPP_SEND_TIMEOUT_MS = 8000;

async function readErrorText(response: Response) {
  const text = await response.text().catch(() => "Unknown WhatsApp API error");
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700) || "Unknown WhatsApp API error";
}

async function postWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHATSAPP_SEND_TIMEOUT_MS);
  try {
    return await fetch(`https://graph.facebook.com/v24.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function sendError(error: unknown): SendResult {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { ok: false, status: 0, error: "WhatsApp request timed out" };
  }
  return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  phoneNumberIdOverride?: string | null,
): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = phoneNumberIdOverride ?? getWhatsAppPhoneNumberId();
  if (!accessToken || !phoneNumberId) {
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }

  let response: Response;
  try {
    response = await postWhatsAppMessage(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    });
  } catch (error) {
    return sendError(error);
  }

  if (response.ok) return { ok: true, status: response.status };
  return {
    ok: false,
    status: response.status,
    error: await readErrorText(response),
  };
}

export async function sendWhatsAppButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  phoneNumberIdOverride?: string | null,
): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = phoneNumberIdOverride ?? getWhatsAppPhoneNumberId();
  if (!accessToken || !phoneNumberId) {
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }

  let response: Response;
  try {
    response = await postWhatsAppMessage(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: {
              id: button.id.slice(0, 256),
              title: button.title.slice(0, 20),
            },
          })),
        },
      },
    });
  } catch (error) {
    return sendError(error);
  }

  if (response.ok) return { ok: true, status: response.status };
  return {
    ok: false,
    status: response.status,
    error: await readErrorText(response),
  };
}

export function buildAvailabilityButtons() {
  return [
    { id: "merchant_confirm_order", title: "نعم متوفر" },
    { id: "merchant_product_out_of_stock", title: "لا غير متوفر" },
  ];
}

export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string,
  phoneNumberIdOverride?: string | null,
): Promise<SendResult> {
  const accessToken = getWhatsAppAccessToken();
  const phoneNumberId = phoneNumberIdOverride ?? getWhatsAppPhoneNumberId();
  if (!accessToken || !phoneNumberId) {
    return { ok: false, status: 0, error: "Missing WhatsApp credentials" };
  }
  if (!/^https:\/\//i.test(imageUrl)) {
    return { ok: false, status: 0, error: "Image URL must be public https" };
  }

  let response: Response;
  try {
    response = await postWhatsAppMessage(phoneNumberId, accessToken, {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: caption ? { link: imageUrl, caption } : { link: imageUrl },
    });
  } catch (error) {
    return sendError(error);
  }

  if (response.ok) return { ok: true, status: response.status };
  return {
    ok: false,
    status: response.status,
    error: await readErrorText(response),
  };
}
