import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// 為每個 HTTP 請求指派 request id，方便錯誤 log 追蹤。
export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  request.headers[REQUEST_ID_HEADER] = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

// 從 request header 讀取 request id。
export function readRequestId(request: Request): string | undefined {
  const value = request.headers[REQUEST_ID_HEADER];
  return typeof value === 'string' ? value : undefined;
}
