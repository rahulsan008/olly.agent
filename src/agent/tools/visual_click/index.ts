import type { ToolRunner } from '../../core/types';

type VisualClickArgs = {
  description?: string;
};

interface VisualClickResult {
  success: boolean;
  x?: number;
  y?: number;
  elementFound?: boolean;
  error?: string;
}

interface GetCoordinatesResponse {
  x: number;
  y: number;
}

async function captureScreenshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CAPTURE_SCREENSHOT', quality: 80 },
      (response: { ok: boolean; dataUrl?: string; error?: string }) => {
        if (response.ok && response.dataUrl) {
          resolve(response.dataUrl);
        } else {
          reject(new Error(response.error ?? 'Screenshot capture failed'));
        }
      }
    );
  });
}

async function getCoordinates(description: string, screenshotDataUrl: string): Promise<GetCoordinatesResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_COORDINATES', description, screenshotDataUrl },
      (response: { ok: boolean; x?: number; y?: number; error?: string }) => {
        if (response.ok && typeof response.x === 'number' && typeof response.y === 'number') {
          resolve({ x: response.x, y: response.y });
        } else {
          reject(new Error(response.error ?? 'Failed to get coordinates'));
        }
      }
    );
  });
}

async function execute(description: string): Promise<GetCoordinatesResponse> {
  const screenshotDataUrl = await captureScreenshot();
  return getCoordinates(description, screenshotDataUrl);
}

function clickAtCoordinates(x: number, y: number): { success: boolean; elementFound: boolean } {
  const element = document.elementFromPoint(x, y);
  if (!element) return { success: false, elementFound: false };

  const eventInit: MouseEventInit = {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
  };

  element.dispatchEvent(new MouseEvent('mousedown', eventInit));
  element.dispatchEvent(new MouseEvent('mouseup', eventInit));
  element.dispatchEvent(new MouseEvent('click', eventInit));

  if (element instanceof HTMLElement) {
    element.click();
  }

  return { success: true, elementFound: true };
}

async function validateAndClick(x: number, y: number): Promise<{ success: boolean; elementFound: boolean }> {
  const exact = clickAtCoordinates(x, y);
  if (exact.success) {
    return exact;
  }

  const offsets = [
    { dx: 5, dy: 0 }, { dx: -5, dy: 0 }, { dx: 0, dy: 5 }, { dx: 0, dy: -5 },
    { dx: 10, dy: 0 }, { dx: -10, dy: 0 }, { dx: 0, dy: 10 }, { dx: 0, dy: -10 }
  ];

  let elementFound = exact.elementFound;
  for (const { dx, dy } of offsets) {
    const offsetResult = clickAtCoordinates(x + dx, y + dy);
    elementFound = elementFound || offsetResult.elementFound;
    if (offsetResult.success) {
      return offsetResult;
    }
  }

  return { success: false, elementFound };
}

export const run: ToolRunner<VisualClickArgs, VisualClickResult> = async (args) => {
  try {
    const description = String(args.description ?? '').trim();
    if (!description) {
      return { success: false, error: 'Description is required' };
    }

    const coords = await execute(description);
    const result = await validateAndClick(coords.x, coords.y);

    return {
      success: result.success
        ? true
        : false,
      data: {
        success: result.success,
        x: coords.x,
        y: coords.y,
        elementFound: result.elementFound,
        error: result.success ? undefined : 'Element found but click failed'
      }
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Visual click failed'
    };
  }
};
