/**
 * Fallback family — generic, works with any instruction-following model.
 * Used for: DeepSeek, Llama, Qwen, Mistral, Ollama local models, unknown providers
 */
import { SHARED_IDENTITY, SHARED_RULES } from "./shared-rules.js";

export const DEFAULT_PROMPT = `${SHARED_IDENTITY}

<agentic_framing>
Resolve the user's task completely. Use tools to read files and codebase structure — never guess. Investigate before fixing, iterate on feedback. Follow existing conventions and style. Keep changes minimal and focused.
</agentic_framing>

${SHARED_RULES}`;
