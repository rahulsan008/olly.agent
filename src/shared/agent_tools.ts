export const AGENTIC_TOOLS_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'click',
      description: 'Click on an element found by query selector or text',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'CSS selector or description of element to click' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'type',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'CSS selector or description of input field' },
          text: { type: 'string', description: 'Text to type' }
        },
        required: ['query', 'text']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'hover',
      description: 'Hover over an element',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'CSS selector or description of element to hover' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'scroll',
      description: 'Scroll the page or an element',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right', 'top', 'bottom'], description: 'Scroll direction' },
          query: { type: 'string', description: 'Description of element to scroll (optional, defaults to page)' },
          selector: { type: 'string', description: 'CSS selector of element to scroll (optional, defaults to page)' },
          amount: { type: 'number', description: 'Amount of pixels to scroll' }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'press_key',
      description: 'Press a keyboard key',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to press (e.g., Enter, Escape, Tab)' },
          query: { type: 'string', description: 'CSS selector of element to focus before pressing key (optional)' }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find',
      description: 'Find elements on page by selector or description',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'CSS selector or description of elements to find' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_by_text',
      description: 'Find elements containing specific text',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for in elements' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_button',
      description: 'Find buttons by text or label',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Button text or label to search for' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'button_byid',
      description: 'Find a button or clickable control by exact selector, id, class, name, data-testid, or text',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Raw CSS selector to match exactly' },
          id: { type: 'string', description: 'Exact element id' },
          className: { type: 'string', description: 'Exact class list, space-separated if needed' },
          name: { type: 'string', description: 'Exact name attribute' },
          dataTestId: { type: 'string', description: 'Exact data-testid attribute' },
          text: { type: 'string', description: 'Visible button text as fallback' },
          query: { type: 'string', description: 'Fallback semantic query' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_buttons',
      description: 'Find all visible buttons matching a query and return selectors with viewport coordinates',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Button text or label to search for' },
          limit: { type: 'number', description: 'Maximum number of matches to return' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_input',
      description: 'Find input fields by name, placeholder, or label',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Input field name, placeholder, or label' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'input_byid',
      description: 'Find an input by exact selector, id, class, name, data-testid, placeholder, or query',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Raw CSS selector to match exactly' },
          id: { type: 'string', description: 'Exact element id' },
          className: { type: 'string', description: 'Exact class list, space-separated if needed' },
          name: { type: 'string', description: 'Exact name attribute' },
          dataTestId: { type: 'string', description: 'Exact data-testid attribute' },
          placeholder: { type: 'string', description: 'Exact placeholder text' },
          query: { type: 'string', description: 'Fallback semantic query' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'extract',
      description: 'Extract specific data from page based on natural language query',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What data to extract (e.g., "product price", "author name")' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_page_text',
      description: 'Get all visible text content from the page',
      parameters: {
        type: 'object',
        properties: {
          includeTitle: { type: 'boolean', description: 'Whether to include page title in the result' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_element_text',
      description: 'Get text content from a specific element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of element to get text from' },
          all: { type: 'boolean', description: 'Whether to return text from all matching elements' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_buttons',
      description: 'Get list of all clickable buttons on page',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_inputs',
      description: 'Get list of all input fields on page',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_links',
      description: 'Get list of all links on page',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_visible_elements',
      description: 'Get list of all visible interactive elements',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'wait_for_element',
      description: 'Wait for an element to appear on page',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Description of element to wait for' },
          selector: { type: 'string', description: 'CSS selector of element to wait for' },
          timeoutMs: { type: 'number', description: 'Maximum time to wait in milliseconds' }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'wait_for_text',
      description: 'Wait for specific text to appear on page',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to wait for' },
          timeoutMs: { type: 'number', description: 'Maximum time to wait in milliseconds' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'go_to_url',
      description: 'Navigate to a specific URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'go_back',
      description: 'Navigate back to previous page',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'refresh',
      description: 'Refresh the current page',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'copy',
      description: 'Copy text to clipboard',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to copy' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'paste',
      description: 'Paste from clipboard into an element',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Description of element to paste into' },
          selector: { type: 'string', description: 'CSS selector of element to paste into' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_selected',
      description: 'Get currently selected text',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_selector',
      description: 'Generate CSS selector for an element',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Description of element to generate selector for' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'record_start',
      description: 'Start recording user actions',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'record_stop',
      description: 'Stop recording user actions',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'record_replay',
      description: 'Replay previously recorded actions',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'screenshot',
      description: 'Take a screenshot of the page',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'click_coordinates',
      description: 'Click at a specific viewport x,y coordinate',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Viewport x coordinate in CSS pixels' },
          y: { type: 'number', description: 'Viewport y coordinate in CSS pixels' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_new_plan',
      description: 'Generate a new plan for a goal',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Goal to plan for' },
          query: { type: 'string', description: 'Alias for goal; natural language task description' },
          imageDataUrl: { type: 'string', description: 'Optional screenshot data URL to help planning' },
          imageBase64: { type: 'string', description: 'Base64-encoded screenshot (jpeg/png) without data URL prefix' },
          trace: {
            type: 'array',
            description: 'Recent actions trace for context',
            items: { type: 'object' }
          },
          context: { type: 'object', description: 'Structured context about current page or state' },
          completed_tasks: {
            type: 'array',
            description: 'List of tasks already completed in this session',
            items: { type: 'string' }
          },
          failed_tasks: {
            type: 'array',
            description: 'List of tasks that failed in this session',
            items: { type: 'string' }
          },
          understand_prev_screen: {
            type: 'string',
            description: 'Latest screen understanding summary (if understand_screen was run)'
          }
        },
        required: ['goal']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'understand_screen',
      description: 'Analyze current page state and content',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'classify_page_state',
      description: 'Classify current page state (loading, error, success, etc)',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'extract_structured_data',
      description: 'Extract structured data from page',
      parameters: {
        type: 'object',
        properties: {
          schema: { type: 'object', description: 'JSON schema of data to extract' }
        },
        required: ['schema']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'rank_candidates',
      description: 'Rank element candidates by relevance to query',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query to rank candidates against' },
          candidates: {
            type: 'array',
            description: 'Array of element candidates',
            items: {
              type: 'object',
              additionalProperties: true
            }
          }
        },
        required: ['query', 'candidates']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_search_query',
      description: 'Generate search query for a goal',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Goal to generate search query for' }
        },
        required: ['goal']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'rewrite_action_query',
      description: 'Rewrite action query for better element matching',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Original query to rewrite' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'detect_blocker',
      description: 'Detect modal, popup, or overlay blocking interaction',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'compose_text',
      description: 'Compose text based on context and intent',
      parameters: {
        type: 'object',
        properties: {
          intent: { type: 'string', description: 'Intent of the text to compose' },
          context: { type: 'string', description: 'Context for text composition' }
        },
        required: ['intent']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'think',
      description: 'Use screenshot and current context to decide one concrete next action',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Current task or local goal' },
          query: { type: 'string', description: 'Alias for goal or current question' },
          candidates: {
            type: 'array',
            description: 'Optional candidate elements or buttons to choose from',
            items: { type: 'object', additionalProperties: true }
          },
          context: { type: 'object', description: 'Structured page context and recent findings' },
          trace: {
            type: 'array',
            description: 'Recent actions trace for context',
            items: { type: 'object' }
          }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'summarize',
      description: 'Summarize provided text or structured context using the LLM',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Primary text to summarize' },
          goal: { type: 'string', description: 'Optional instruction for what kind of summary is needed' },
          context: { type: 'object', description: 'Optional structured context to include in the summary' },
          maxSentences: { type: 'number', description: 'Maximum summary length in sentences' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'verify_task_completion',
      description: 'Verify if a task has been completed successfully',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Task to verify' }
        },
        required: ['task']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'strategy_replan',
      description: 'Generate new strategy when stuck or failing',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Original goal' },
          issue: { type: 'string', description: 'Issue causing need for replanning' }
        },
        required: ['goal', 'issue']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_trace',
      description: 'Start recording execution trace',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_trace',
      description: 'Get current execution trace',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'clear_trace',
      description: 'Clear execution trace',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'visual_click',
      description: 'Click element using GPT-4o-mini vision to locate it on screen',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Natural language description of element to click' }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'random_coordinates_by_text',
      description: 'Return viewport coordinates for a random visible button matching the given text',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to match against visible buttons' }
        },
        required: ['text']
      }
    }
  }
] as const;

export type AgenticToolName = (typeof AGENTIC_TOOLS_SCHEMAS)[number]['function']['name'];

export const AGENTIC_TOOLS = AGENTIC_TOOLS_SCHEMAS.map(
  (tool) => tool.function.name
) as AgenticToolName[];

export const AGENTIC_TOOL_DEFINITIONS = AGENTIC_TOOLS_SCHEMAS.map(
  (tool) => tool.function
);

export const AGENTIC_TOOL_NAME_SET: ReadonlySet<string> = new Set(AGENTIC_TOOLS);

export function isAgenticToolName(value: unknown): value is AgenticToolName {
  return typeof value === 'string' && AGENTIC_TOOL_NAME_SET.has(value);
}

function formatToolSignature(parameters: {
  properties?: Record<string, unknown>;
  required?: readonly string[];
}): string {
  const properties = parameters.properties ?? {};
  const required = new Set(parameters.required ?? []);
  const keys = Object.keys(properties);

  if (!keys.length) return '{}';

  const parts = keys.map((key) => (required.has(key) ? key : `${key}?`));
  return `{ ${parts.join(', ')} }`;
}

export const AGENTIC_TOOL_PROMPT_REFERENCE = AGENTIC_TOOLS_SCHEMAS.map(
  (tool) => `${tool.function.name} ${formatToolSignature(tool.function.parameters)}`
).join('\n');
