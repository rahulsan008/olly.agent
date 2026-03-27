import { getPageSnapshot } from './dom-reader';
import { clickElement, typeText, scrollPage, extractData, waitForElement, pressKey, clickAtCoordinates, submitComment } from './action-executor';
import { highlightElement } from './highlighter';
import { browserAgent } from '../agent';
import type { BackgroundToContent } from '../shared/messages';

chrome.runtime.onMessage.addListener(
  (message: BackgroundToContent, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'PING':
          sendResponse({ success: true, ready: true, url: window.location.href, title: document.title });
          break;

        case 'GET_PAGE_CONTENT':
          sendResponse({ snapshot: getPageSnapshot() });
          break;

        case 'CLICK_ELEMENT':
          sendResponse(await clickElement(message.selector));
          break;

        case 'TYPE_TEXT':
          sendResponse(await typeText(message.selector, message.text));
          break;

        case 'SCROLL_PAGE':
          sendResponse(await scrollPage(message.direction, message.amount));
          break;

        case 'HIGHLIGHT_ELEMENT':
          highlightElement(message.selector);
          sendResponse({ success: true });
          break;

        case 'EXTRACT_DATA':
          sendResponse(extractData(message.selector));
          break;

        case 'WAIT_FOR_ELEMENT':
          sendResponse(await waitForElement(message.selector, message.timeout));
          break;

        case 'PRESS_KEY':
          sendResponse(await pressKey(message.key));
          break;

        case 'CLICK_AT_COORDINATES':
          sendResponse(await clickAtCoordinates(message.x, message.y));
          break;

        case 'SUBMIT_COMMENT':
          sendResponse(await submitComment());
          break;

        case 'RUN_AGENT_TOOL':
          sendResponse(await browserAgent.runTool({ tool: message.tool, args: message.args ?? {} }));
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    })();
    return true;
  }
);
