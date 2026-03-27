import OpenAI from 'openai';
import { generatePrompt } from '../prompts';
import { recordLlmUsage } from './llm_usage';

export type LlmToolResult = { success: boolean; data?: unknown; error?: string };

type Params = {
  llmTool: string;
  args: Record<string, unknown>;
  apiKey: string;
  model: string;
  screenshotDataUrl?: string | null;
  signal: AbortSignal;
};

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

async function callJson(params: {
  apiKey: string;
  model: string;
  system: string;
  user: Record<string, unknown>;
  screenshotDataUrl?: string | null;
  signal: AbortSignal;
  source: string;
}): Promise<unknown> {
  const openai = new OpenAI({ apiKey: params.apiKey, dangerouslyAllowBrowser: true });
  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: 'text', text: JSON.stringify(params.user, null, 2) }
  ];
  if (params.screenshotDataUrl) {
    userContent.push({ type: 'image_url', image_url: { url: params.screenshotDataUrl, detail: 'low' } });
  }

  try {
    const res = await openai.chat.completions.create({
      model: params.model,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: userContent }
      ],
      max_completion_tokens: 900
    }, { signal: params.signal });

    await recordLlmUsage({
      source: params.source,
      model: params.model,
      usage: res.usage,
      status: 'success'
    });

    return parseJson(res.choices[0]?.message?.content ?? '{}', {});
  } catch (error) {
    await recordLlmUsage({
      source: params.source,
      model: params.model,
      status: 'error',
      error: error instanceof Error ? error.message : 'LLM call failed'
    });
    throw error;
  }
}

export async function runLlmTool(params: Params): Promise<LlmToolResult> {
  const { llmTool, args, apiKey, model, screenshotDataUrl, signal } = params;
  const goal = typeof args.goal === 'string' ? args.goal : (typeof args.query === 'string' ? args.query : 'Complete the task');
  const trace = Array.isArray(args.trace) ? args.trace : [];
  const context = (args.context && typeof args.context === 'object') ? (args.context as Record<string, unknown>) : args;

  try {
    switch (llmTool) {
      case 'understand_screen': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.understand_screen',
          system: generatePrompt({ type: 'screen', goal, trace, context }),
          user: { goal, trace, context },
          signal
        });
        return { success: true, data };
      }
      case 'classify_page_state': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.classify_page_state',
          system: [
            'Classify current browser page state from provided context/screenshot.',
            'Return strict JSON: { "state": "string", "confidence": 0.0, "evidence": "short" }'
          ].join('\n'),
          user: args,
          screenshotDataUrl,
          signal
        });
        return { success: true, data };
      }
      case 'extract_structured_data': {
        const schema = args.schema ?? { fields: ['title', 'value'] };
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.extract_structured_data',
          system: [
            'Extract structured data from the provided context and screenshot.',
            `Follow this schema hint: ${JSON.stringify(schema)}`,
            'Return strict JSON only.'
          ].join('\n'),
          user: args,
          screenshotDataUrl,
          signal
        });
        return { success: true, data };
      }
      case 'rank_candidates': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.rank_candidates',
          system: 'Rank candidates and return strict JSON: { "best_index": number, "reason": "short", "confidence": 0.0 }',
          user: args,
          signal
        });
        return { success: true, data };
      }
      case 'generate_search_query': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.generate_search_query',
          system: 'Generate one high-quality search query. Return strict JSON: { "query": "..." }',
          user: args,
          signal
        });
        return { success: true, data };
      }
      case 'rewrite_action_query': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.rewrite_action_query',
          system: 'Rewrite failed action query to a better human-like query. Return strict JSON: { "query": "...", "reason": "short" }',
          user: args,
          signal
        });
        return { success: true, data };
      }
      case 'detect_blocker': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.detect_blocker',
          system: 'Detect blocker type. Return strict JSON: { "blocker": "none|captcha|login_required|paywall|permission_popup|rate_limit|unknown", "confidence": 0.0, "next_action": "short" }',
          user: args,
          screenshotDataUrl,
          signal
        });
        return { success: true, data };
      }
      case 'compose_text': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.compose_text',
          system: 'Compose final user-facing text for typing. Return strict JSON: { "text": "..." }',
          user: args,
          signal
        });
        return { success: true, data };
      }
      case 'verify_task_completion': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.verify_task_completion',
          system: 'Verify if task is complete. Return strict JSON: { "done": true|false, "reason": "short", "missing_action": "optional" }',
          user: args,
          screenshotDataUrl,
          signal
        });
        return { success: true, data };
      }
      case 'strategy_replan': {
        const data = await callJson({
          apiKey,
          model,
          source: 'llm_tools.strategy_replan',
          system: generatePrompt({ type: 'not_working', goal, trace, context }),
          user: { goal, trace, context },
          screenshotDataUrl,
          signal
        });
        return { success: true, data };
      }
      default:
        return { success: false, error: `Unknown LLM tool: ${llmTool}` };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'LLM tool failed' };
  }
}
