import type { JSONObject } from "@ai-sdk/provider";
import { generateText } from "ai";
import type { MemoryManager } from "./manager.js";
import type { MemoryCategory, MemoryScope } from "./types.js";

interface ExtractedMemory {
  title: string;
  content: string;
  category: MemoryCategory;
  tags: string[];
}

interface ExtractOpts {
  providerOptions?: Record<string, JSONObject>;
  headers?: Record<string, string>;
}

const EXTRACTION_PROMPT = [
  "You are reviewing a coding conversation to extract durable knowledge worth remembering across sessions.",
  "",
  "Extract ONLY:",
  "- Architectural decisions ('we decided to use X because Y')",
  "- Coding conventions ('always use bun, not npm')",
  "- User preferences ('no comments in code')",
  "- Patterns discovered ('3-tier fallback for navigation')",
  "- Important facts about the codebase or project",
  "",
  "Do NOT extract:",
  "- Session-specific context (current task, in-progress work, temporary state)",
  "- File paths or line numbers (too ephemeral)",
  "- Debugging steps (too specific)",
  "- Anything the user only did once and didn't express as a preference",
  "",
  "Return a JSON array. Each item: { title, content, category, tags }",
  "category must be one of: decision, convention, preference, architecture, pattern, fact",
  "tags: 1-3 short keywords",
  "",
  "If nothing worth remembering, return: []",
  "",
  "Be very selective — only extract knowledge that will be useful in FUTURE sessions.",
].join("\n");

export async function extractMemories(
  conversationText: string,
  model: Parameters<typeof generateText>[0]["model"],
  opts?: ExtractOpts,
): Promise<ExtractedMemory[]> {
  if (conversationText.length < 500) return [];

  const sample =
    conversationText.length > 12000
      ? `${conversationText.slice(0, 4000)}\n...\n${conversationText.slice(-8000)}`
      : conversationText;

  const { text } = await generateText({
    model,
    maxOutputTokens: 1024,
    ...(opts?.providerOptions ? { providerOptions: opts.providerOptions } : {}),
    ...(opts?.headers ? { headers: opts.headers } : {}),
    prompt: `${EXTRACTION_PROMPT}\n\nCONVERSATION:\n${sample}`,
  });

  return parseExtraction(text);
}

function parseExtraction(text: string): ExtractedMemory[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    const validCategories = new Set([
      "decision",
      "convention",
      "preference",
      "architecture",
      "pattern",
      "fact",
    ]);

    return parsed
      .filter((item): item is ExtractedMemory => {
        if (!item || typeof item !== "object") return false;
        const obj = item as Record<string, unknown>;
        return (
          typeof obj.title === "string" &&
          typeof obj.content === "string" &&
          typeof obj.category === "string" &&
          validCategories.has(obj.category) &&
          Array.isArray(obj.tags)
        );
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

export async function autoExtractAndSave(
  memoryManager: MemoryManager,
  conversationText: string,
  model: Parameters<typeof generateText>[0]["model"],
  opts?: ExtractOpts & { scope?: MemoryScope },
): Promise<number> {
  const { scope: scopeOpt, ...extractOpts } = opts ?? {};
  const memories = await extractMemories(conversationText, model, extractOpts);
  if (memories.length === 0) return 0;

  const scope = scopeOpt ?? memoryManager.scopeConfig.writeScope;
  if (scope === "none") return 0;

  let saved = 0;
  for (const mem of memories) {
    const existing = memoryManager.search(mem.title, scope as MemoryScope, 3);
    const isDuplicate = existing.some((e) => {
      const titleSim =
        e.title.toLowerCase().includes(mem.title.toLowerCase().slice(0, 20)) ||
        mem.title.toLowerCase().includes(e.title.toLowerCase().slice(0, 20));
      return titleSim && e.category === mem.category;
    });

    if (isDuplicate) continue;

    memoryManager.write(scope as MemoryScope, {
      title: mem.title,
      content: mem.content,
      category: mem.category,
      tags: mem.tags.map(String).slice(0, 5),
    });
    saved++;
  }

  return saved;
}
