/**
 * Shared JSON extraction for LLM agent responses (Claude, etc.).
 */

/** Strip markdown fences and isolate the outermost JSON object or array. */
export function extractJsonPayload(text: string): string {
  let trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  if (fenceMatch) trimmed = fenceMatch[1].trim();

  const objStart = trimmed.indexOf("{");
  const arrStart = trimmed.indexOf("[");
  let start = -1;
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) start = objStart;
  else if (arrStart >= 0) start = arrStart;
  if (start < 0) return trimmed;

  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }

  return trimmed.slice(start);
}

function sliceBalancedJson(text: string, openIndex: number, open: "{" | "["): string | null {
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }

  return null;
}

/** Find a keyed JSON array anywhere in mixed LLM output (e.g. "topics" or "posts"). */
function extractKeyedArrayFromText(
  text: string,
  key: string,
): Record<string, unknown[]> | null {
  const keyMatch = new RegExp(`"${key}"\\s*:`, "i").exec(text);
  if (!keyMatch || keyMatch.index === undefined) return null;

  const bracketStart = text.indexOf("[", keyMatch.index);
  if (bracketStart < 0) return null;

  const arrayJson = sliceBalancedJson(text, bracketStart, "[");
  if (!arrayJson) return null;

  try {
    const arr = JSON.parse(arrayJson) as unknown;
    if (Array.isArray(arr)) return { [key]: arr };
  } catch {
    // try wrapping as object
  }

  try {
    const wrapped = JSON.parse(`{"${key}":${arrayJson}}`) as Record<string, unknown[]>;
    if (Array.isArray(wrapped[key])) return { [key]: wrapped[key] };
  } catch {
    // ignore
  }

  return null;
}

/** Find a "posts" array anywhere in mixed LLM output. */
function extractPostsArrayFromText(text: string): { posts: unknown[] } | null {
  const keyMatch = /"posts"\s*:/i.exec(text);
  if (!keyMatch || keyMatch.index === undefined) return null;

  const bracketStart = text.indexOf("[", keyMatch.index);
  if (bracketStart < 0) return null;

  const arrayJson = sliceBalancedJson(text, bracketStart, "[");
  if (!arrayJson) return null;

  try {
    const posts = JSON.parse(arrayJson) as unknown;
    if (Array.isArray(posts)) return { posts };
  } catch {
    // try wrapping as object
  }

  try {
    const wrapped = JSON.parse(`{"posts":${arrayJson}}`) as { posts?: unknown[] };
    if (Array.isArray(wrapped.posts)) return { posts: wrapped.posts };
  } catch {
    // ignore
  }

  return null;
}

export function parseAgentJsonContent<T>(content: string, agentType: string): T {
  const trimmed = content.trim();
  const extracted = extractJsonPayload(content);
  const firstObjectToLastObject =
    trimmed.includes("{") && trimmed.includes("}")
      ? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1)
      : "";
  const normalizedExtracted = extracted
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  const postsFromText = extractPostsArrayFromText(trimmed);
  const topicsFromText = extractKeyedArrayFromText(trimmed, "topics");
  const useTopicsKey = agentType === "generateTrendingTopics";

  const attempts: Array<{ label: string; parse: () => unknown }> = [
    { label: "raw", parse: () => JSON.parse(trimmed) },
    { label: "extracted", parse: () => JSON.parse(extracted) },
    { label: "firstObjectToLastObject", parse: () => JSON.parse(firstObjectToLastObject) },
    { label: "normalizedExtracted", parse: () => JSON.parse(normalizedExtracted) },
    {
      label: "postsArrayExtract",
      parse: () => {
        const postsPayload = extractPostsArrayFromText(trimmed);
        if (!postsPayload) throw new Error('no "posts" array found in text');
        return postsPayload;
      },
    },
  ];

  if (postsFromText) {
    attempts.unshift({
      label: "postsArrayExtractEarly",
      parse: () => postsFromText,
    });
  }

  if (topicsFromText) {
    attempts.unshift({
      label: "topicsArrayExtractEarly",
      parse: () => topicsFromText,
    });
  }

  if (useTopicsKey) {
    attempts.push({
      label: "topicsArrayExtract",
      parse: () => {
        const payload = extractKeyedArrayFromText(trimmed, "topics");
        if (!payload) throw new Error('no "topics" array found in text');
        return payload;
      },
    });
  }

  let lastError: unknown;
  for (const { label, parse } of attempts) {
    try {
      const value = parse();
      return value as T;
    } catch (err) {
      lastError = err;
      console.warn("[agents] JSON parse attempt failed", {
        agentType,
        attempt: label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("========== [agents] LLM RAW RESPONSE (JSON PARSE FAILED) ==========");
  console.log(content);
  console.log("========== [agents] END LLM RAW RESPONSE ==========");

  const preview600 = content.slice(0, 600);
  console.error("[agents] Failed to parse agent JSON after all attempts", {
    agentType,
    contentLength: content.length,
    preview600,
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });

  const expectedKey = useTopicsKey ? '"topics"' : '"posts"';
  throw new Error(
    `Agent returned invalid JSON (${agentType}). Could not find a valid ${expectedKey} array. Raw response (first 600 chars): ${preview600}`,
  );
}
