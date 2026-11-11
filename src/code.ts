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
  dataBase64: string;
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

// 二进制经 postMessage 传输时统一用 base64：
// 数字数组走 JSON 会被放大 4 倍以上（每个字节 ~4 个字符），大批量导出极易卡住甚至丢消息
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < B64_CHARS.length; i++) table[B64_CHARS.charCodeAt(i)] = i;
  return table;
})();

function encodeBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  const STEP = 3 * 8192; // 每片输入字节数（3 的倍数）
  for (let start = 0; start < bytes.length; start += STEP) {
    const end = Math.min(start + STEP, bytes.length);
    let chunk = '';
    let i = start;
    for (; i + 3 <= end; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      chunk += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63];
    }
    if (end === bytes.length) {
      const rest = bytes.length - i;
      if (rest === 1) {
        const n = bytes[i] << 16;
        chunk += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
      } else if (rest === 2) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
        chunk += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '=';
      }
    }
    out.push(chunk);
  }
  return out.join('');
}

function decodeBase64(str: string): Uint8Array {
  let len = str.length;
  while (len > 0 && str.charCodeAt(len - 1) === 61 /* '=' */) len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let outPos = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[str.charCodeAt(i)];
    const b = B64_LOOKUP[str.charCodeAt(i + 1)];
    const c = i + 2 < len ? B64_LOOKUP[str.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_LOOKUP[str.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[outPos++] = (n >> 16) & 255;
    if (outPos < out.length) out[outPos++] = (n >> 8) & 255;
    if (outPos < out.length) out[outPos++] = n & 255;
  }
  return out;
}

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
      // 注意：Figma 沙盒的 fetch 校验 body 只接受 Uint8Array / string，不接受 ArrayBuffer
      const uploadBytes = decodeBase64(msg.dataBase64);
      const res = await fetch(msg.workerBase + '/shrink', {
        method: 'POST',
        headers: {
          'X-TinyPNG-Key': msg.apiKey,
          'Content-Type': 'application/octet-stream',
        },
        body: uploadBytes,
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
          dataBase64: '',
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
        dataBase64: encodeBase64(new Uint8Array(buf)),
      });
    } catch (e: unknown) {
      figma.ui.postMessage({
        type: 'tinypng-download-result',
        requestId: msg.requestId,
        ok: false,
        status: 0,
        dataBase64: '',
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

    // Figma 插件 API 的 exportAsync 不支持直接导出 WebP（仅 PNG/JPG/SVG/PDF）：
    // WebP 走「无损 PNG 导出 → UI 端转码 WebP → TinyPNG 压缩」流程
    const figmaFormat: 'PNG' | 'JPG' = format === 'webp'
      ? 'PNG'
      : (format.toUpperCase() as 'PNG' | 'JPG');
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
        figma.ui.postMessage({ type: 'layer-error', name: node.name, message: errMsg });
        continue;
      }

      const safeName = node.name.replace(/[/\\:*?"<>|]/g, '_');
      const filename = `${safeName}@${scale}x.${format}`;
      const progress = Math.round(((i + 1) / total) * 100);

      figma.ui.postMessage({
        type: 'compress-and-save',
        dataBase64: encodeBase64(imageData),
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
