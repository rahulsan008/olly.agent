import type { ToolResult } from '../../core/types';

type ScreenshotArgs = {
  quality?: number; // 0–100, default 80
};

type ScreenshotData = {
  dataUrl: string;   // base64 PNG/JPEG data URL
  width: number;     // viewport CSS width in px
  height: number;    // viewport CSS height in px
  devicePixelRatio: number;
};

export async function run(args: ScreenshotArgs = {}): Promise<ToolResult<ScreenshotData>> {
  const quality = Math.min(100, Math.max(0, args.quality ?? 80));

  // captureVisibleTab only runs in the background — ask it via message
  const response = await chrome.runtime.sendMessage({
    type: 'CAPTURE_SCREENSHOT',
    quality
  }) as { ok: boolean; dataUrl?: string; error?: string } | undefined;

  if (!response?.ok || !response.dataUrl) {
    return { success: false, error: response?.error ?? 'Screenshot failed' };
  }

  return {
    success: true,
    data: {
      dataUrl: response.dataUrl,
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    }
  };
}
