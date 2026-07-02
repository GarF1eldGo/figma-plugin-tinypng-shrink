/// <reference types="@figma/plugin-typings" />

interface ExportRequest {
  type: 'start-export';
  apiKey: string;
  compressionTimes: number;
  format: 'png' | 'jpg' | 'webp';
  scale: number;
  workerBase: string;
}

interface GetSettingsRequest {
  type: 'get-settings';
}

interface SaveSettingsRequest {
  type: 'save-settings';
  apiKey: string;
  workerBase: string;
}

interface TinyPNGUploadRequest {
  type: 'tinypng-upload';
  data: number[];
  apiKey: string;
  workerBase: string;
  requestId: string;
}

interface TinyPNGDownloadRequest {
  type: 'tinypng-download';
  url: string;
  apiKey: string;
  format: string;
  workerBase: string;
  requestId: string;
}

type UIMessage =
  | ExportRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | TinyPNGUploadRequest
  | TinyPNGDownloadRequest;

const STORAGE_KEY_API = 'tinypng_api_key';
const STORAGE_KEY_WORKER = 'tinypng_worker_base';

figma.showUI(__html__, { width: 320, height: 560 });

figma.ui.onmessage = async (msg: UIMessage) => {
  if (msg.type === 'get-settings') {
    const apiKey = await figma.clientStorage.getAsync(STORAGE_KEY_API);
    const workerBase = await figma.clientStorage.getAsync(STORAGE_KEY_WORKER);
    figma.ui.postMessage({
      type: 'load-settings',
      apiKey: apiKey ?? '',
      workerBase: workerBase ?? '',
    });
    return;
  }

  if (msg.type === 'save-settings') {
    await figma.clientStorage.setAsync(STORAGE_KEY_API, msg.apiKey);
    await figma.clientStorage.setAsync(STORAGE_KEY_WORKER, msg.workerBase);
    return;
  }

  if (msg.type === 'tinypng-upload') {
    try {
      const res = await fetch(msg.workerBase + '/shrink', {
        method: 'POST',
        headers: {
          'X-TinyPNG-Key': msg.apiKey,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(msg.data),
      });
      const body = await res.text();
      figma.ui.postMessage({
        type: 'tinypng-upload-result',
        requestId: msg.requestId,
        ok: res.ok,
        status: res.status,
        body,
      });
    } catch (e: unknown) {
      figma.ui.postMessage({
        type: 'tinypng-upload-result',
        requestId: msg.requestId,
        ok: false,
        status: 0,
        body: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (msg.type === 'tinypng-download') {
    try {
      const res = await fetch(msg.workerBase + '/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-TinyPNG-Key': msg.apiKey,
        },
        body: JSON.stringify({ url: msg.url, format: msg.format }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        figma.ui.postMessage({
          type: 'tinypng-download-result',
          requestId: msg.requestId,
          ok: false,
          status: res.status,
          data: [],
          error: errBody,
        });
        return;
      }
      const buf = await res.arrayBuffer();
      figma.ui.postMessage({
        type: 'tinypng-download-result',
        requestId: msg.requestId,
        ok: true,
        status: res.status,
        data: Array.from(new Uint8Array(buf)),
      });
    } catch (e: unknown) {
      figma.ui.postMessage({
        type: 'tinypng-download-result',
        requestId: msg.requestId,
        ok: false,
        status: 0,
        data: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }

  if (msg.type === 'start-export') {
    const { apiKey, compressionTimes, format, scale, workerBase } = msg;

    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'export-error', message: '请先选择要导出的图层' });
      return;
    }

    const figmaFormat = format.toUpperCase() as 'PNG' | 'JPG' | 'WEBP';
    const total = selection.length;

    for (let i = 0; i < selection.length; i++) {
      const node = selection[i];
      let imageData: Uint8Array;
      try {
        imageData = await (node as SceneNode & ExportMixin).exportAsync({
          format: figmaFormat,
          constraint: { type: 'SCALE', value: scale },
        });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        figma.ui.postMessage({ type: 'layer-error', message: errMsg });
        continue;
      }

      const safeName = node.name.replace(/[/\\:*?"<>|]/g, '_');
      const filename = `${safeName}@${scale}x.${format}`;
      const progress = Math.round(((i + 1) / total) * 100);

      figma.ui.postMessage({
        type: 'compress-and-save',
        data: Array.from(imageData),
        filename,
        format,
        compressionTimes,
        progress,
        workerBase,
      });
    }

    figma.ui.postMessage({ type: 'all-layers-sent', total });
  }
};
