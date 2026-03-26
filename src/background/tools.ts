import type OpenAI from 'openai';

export const BROWSER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_page_content',
      description:
        'Read the current page: URL, title, visible text, and a list of interactive elements (buttons, inputs, links). Always call this first to understand the page state.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_element',
      description: 'Click a button, link, or any interactive element on the page.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element (e.g. "#submit-btn", "button.primary", "a[href*=login]")'
          }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: 'Type text into an input, textarea, or search box.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input element' },
          text: { type: 'string', description: 'Text to type' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scroll_page',
      description: 'Scroll the page to reveal more content.',
      parameters: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down', 'top', 'bottom'],
            description: 'Scroll direction'
          },
          amount: {
            type: 'number',
            description: 'Pixels to scroll (ignored for top/bottom, default 300)'
          }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Navigate the browser to a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL including https://' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_data',
      description: 'Extract and return text content from matching elements.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for element(s) to extract' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_element',
      description: 'Wait until an element appears on the page (e.g. after navigation or loading).',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          timeout: { type: 'number', description: 'Max wait time in ms (default 5000)' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'press_key',
      description: 'Press a keyboard key on the currently focused element. Use "Enter" to submit comments/forms, "Tab" to move focus, "Escape" to close dialogs.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown', 'ArrowUp'],
            description: 'The key to press'
          }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_at_coordinates',
      description: 'Click at specific x,y pixel coordinates on the screen. Use this when you can see a button or element in the screenshot but CSS selectors fail to find it. Coordinates come from the screenshot image.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate in screenshot pixels (horizontal)' },
          y: { type: 'number', description: 'Y coordinate in screenshot pixels (vertical)' }
        },
        required: ['x', 'y']
      }
    }
  }
];
