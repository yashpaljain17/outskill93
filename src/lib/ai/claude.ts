import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Server-side refusal fallback: if a safety classifier declines, the API
// retries on Anthropic's recommended fallback model inside the same call.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new MissingKeyError();
  }
  client ??= new Anthropic();
  return client;
}

export class MissingKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.");
  }
}

export function aiErrorMessage(err: unknown): { message: string; status: number } {
  if (err instanceof MissingKeyError) return { message: err.message, status: 503 };
  if (err instanceof Anthropic.AuthenticationError)
    return { message: "The Anthropic API key was rejected.", status: 503 };
  if (err instanceof Anthropic.RateLimitError)
    return { message: "The AI is busy right now — try again in a moment.", status: 429 };
  if (err instanceof Anthropic.APIError)
    return { message: `AI request failed (${err.status ?? "network"}).`, status: 502 };
  return { message: "Something went wrong talking to the AI.", status: 500 };
}

export const SAFETY_RULES = `Safety rules:
- You are not a veterinarian. Never invent medication names, doses or schedules that the owner or their vet did not provide. If a dose is missing, tell the owner to confirm it with their vet.
- If the situation sounds urgent (toxin ingestion such as chocolate, xylitol, grapes, lilies; trouble breathing; collapse; seizures; bloated hard abdomen; heavy bleeding; not urinating; heatstroke), say clearly and first that they should contact a vet or emergency clinic now.
- Be warm, practical and concise.`;
