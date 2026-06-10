// Customer voice search (server side).
//
// When a customer sends a WhatsApp voice note, the webhook passes the media id
// here. We download the audio from the WhatsApp Cloud API (two-step: media
// lookup → authenticated file download) and transcribe it with OpenAI Whisper
// (Arabic). The transcript is then fed into the normal text workflow, so a
// voice note behaves exactly like a typed message — search, selection, order
// form answers, everything.

import OpenAI, { toFile } from "openai";

// WhatsApp voice notes are short OGG/Opus files; anything bigger than this is
// not a voice search (Whisper's own limit is 25MB).
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

function getWhatsAppAccessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN;
}

// Map the Cloud API mime type to a filename extension Whisper recognises.
function audioFileName(mimeType: string) {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const byMime: Record<string, string> = {
    "audio/ogg": "voice.ogg",
    "audio/opus": "voice.ogg",
    "audio/mpeg": "voice.mp3",
    "audio/mp3": "voice.mp3",
    "audio/mp4": "voice.mp4",
    "audio/aac": "voice.m4a",
    "audio/amr": "voice.amr",
    "audio/wav": "voice.wav",
    "audio/webm": "voice.webm",
  };
  return byMime[base] ?? "voice.ogg";
}

export type VoiceTranscription =
  | { ok: true; text: string }
  | { ok: false; reason: "not_configured" | "download_failed" | "too_large" | "transcribe_failed" };

// Download a WhatsApp media object and transcribe it. Returns a typed result
// instead of throwing so the webhook can answer the customer gracefully.
export async function transcribeWhatsAppVoice(mediaId: string): Promise<VoiceTranscription> {
  const accessToken = getWhatsAppAccessToken();
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!accessToken || !openaiKey) {
    console.warn("[Voice] Missing WHATSAPP_ACCESS_TOKEN or OPENAI_API_KEY — voice search disabled");
    return { ok: false, reason: "not_configured" };
  }

  // Step 1: resolve the media id to a short-lived download URL.
  let mediaUrl = "";
  let mimeType = "audio/ogg";
  try {
    const metaResponse = await fetch(`https://graph.facebook.com/v24.0/${mediaId}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!metaResponse.ok) {
      console.error("[Voice] Media lookup failed:", metaResponse.status);
      return { ok: false, reason: "download_failed" };
    }
    const meta = (await metaResponse.json()) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
    };
    if (!meta.url) return { ok: false, reason: "download_failed" };
    if (typeof meta.file_size === "number" && meta.file_size > MAX_AUDIO_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    mediaUrl = meta.url;
    if (meta.mime_type) mimeType = meta.mime_type;
  } catch (error) {
    console.error("[Voice] Media lookup threw:", error);
    return { ok: false, reason: "download_failed" };
  }

  // Step 2: download the audio bytes (the URL itself requires the same token).
  let bytes: Buffer;
  try {
    const fileResponse = await fetch(mediaUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!fileResponse.ok) {
      console.error("[Voice] Media download failed:", fileResponse.status);
      return { ok: false, reason: "download_failed" };
    }
    const arrayBuffer = await fileResponse.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) return { ok: false, reason: "too_large" };
    bytes = Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("[Voice] Media download threw:", error);
    return { ok: false, reason: "download_failed" };
  }

  // Step 3: Whisper speech-to-text (Arabic — handles Iraqi dialect well).
  // Set a 30-second timeout to prevent webhook hangs.
  try {
    const client = new OpenAI({ apiKey: openaiKey });
    const transcriptionPromise = client.audio.transcriptions.create({
      file: await toFile(bytes, audioFileName(mimeType), { type: mimeType }),
      model: "whisper-1",
      language: "ar",
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Whisper timeout")), 30000)
    );

    const transcription = await Promise.race([
      transcriptionPromise,
      timeoutPromise,
    ]) as Awaited<typeof transcriptionPromise>;

    const text = (transcription.text ?? "").trim();
    // Reject transcriptions that are too short — likely silence or noise.
    if (text.length < 3) return { ok: false, reason: "transcribe_failed" };
    return { ok: true, text };
  } catch (error) {
    console.error("[Voice] Transcription failed:", error);
    return { ok: false, reason: "transcribe_failed" };
  }
}
