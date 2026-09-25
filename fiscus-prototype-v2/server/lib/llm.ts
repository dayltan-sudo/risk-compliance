import type { z } from "zod";

// Generic OpenAI-compatible chat-completions client, used by exactly two
// server-side modules per the MVP's "two model surfaces" constraint —
// Extraction (FR2) and Risk Commentary (FR11). OpenCode Go requires callers
// to identify themselves with their own User-Agent and a stable per-session
// header (docs: https://opencode.ai/docs/go) rather than a generic SDK name.
const USER_AGENT = "fiscus-credit-assessment/1.0";

interface StructuredCompletionOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  sessionId: string;
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function requestCompletion(system: string, user: string, sessionId: string): Promise<string> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM is not configured (LLM_BASE_URL/LLM_API_KEY/LLM_MODEL)");
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": USER_AGENT,
      "x-opencode-session": sessionId,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM request failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("LLM response missing content");
  }
  return content;
}

/** Calls the model, validates the JSON response against `schema`, and retries
 * once with an error-correction hint if parsing/validation fails — the
 * "validate JSON, one retry on invalid JSON" rule shared by both model
 * surfaces. Throws if the retry also fails; callers treat that as a genuine
 * extraction/commentary miss, never a crash (Statement Extraction.md §8). */
export async function callStructuredLLM<T>({ system, user, schema, sessionId }: StructuredCompletionOptions<T>): Promise<T> {
  const attempt = async (extra?: string): Promise<T> => {
    const raw = await requestCompletion(system, extra ? `${user}\n\n${extra}` : user, sessionId);
    const jsonText = stripCodeFence(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Model response was not valid JSON");
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Model response did not match the expected shape: ${result.error.message}`);
    }
    return result.data;
  };

  try {
    return await attempt();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return await attempt(
      `Your previous response was invalid (${reason}). Reply again with ONLY a single valid JSON object matching the required shape — no markdown fences, no commentary.`,
    );
  }
}
