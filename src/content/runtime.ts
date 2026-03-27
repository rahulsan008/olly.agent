import { getPageSnapshot } from './dom-reader';
import {
  clickAtCoordinates,
  clickElement,
  extractData,
  pressKey,
  scrollPage,
  submitComment,
  typeText,
  waitForElement
} from './action-executor';
import { highlightElement } from './highlighter';
import type { BackgroundToContent } from '../shared/messages';
import { browserAgent } from '../agent';

export async function handleContentMessage(message: BackgroundToContent): Promise<unknown> {
  switch (message.type) {
    case 'GET_PAGE_CONTENT':
      return { snapshot: getPageSnapshot() };

    case 'CLICK_ELEMENT':
      return clickElement(message.selector);

    case 'TYPE_TEXT':
      return typeText(message.selector, message.text);

    case 'SCROLL_PAGE':
      return scrollPage(message.direction, message.amount);

    case 'HIGHLIGHT_ELEMENT':
      highlightElement(message.selector);
      return { success: true };

    case 'EXTRACT_DATA':
      return extractData(message.selector);

    case 'WAIT_FOR_ELEMENT':
      return waitForElement(message.selector, message.timeout);

    case 'PRESS_KEY':
      return pressKey(message.key);

    case 'CLICK_AT_COORDINATES':
      return clickAtCoordinates(message.x, message.y);

    case 'SUBMIT_COMMENT':
      return submitComment();

    case 'RUN_AGENT_TOOL':
      return browserAgent.runTool({ tool: message.tool, args: message.args ?? {} });

    case 'PING':
      return { success: true };

    default:
      return { success: false, error: 'Unknown message type' };
  }
}
