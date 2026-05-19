import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorBody } from './api-exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  // 將所有未處理例外轉成穩定的 error.code + error.message 格式。
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const body = this.toErrorBody(exceptionResponse, status);

    response.status(status).json(body);
  }

  // 保留已符合契約的錯誤格式，其餘錯誤統一收斂成通用錯誤碼。
  private toErrorBody(exceptionResponse: unknown, status: number): ApiErrorBody {
    if (this.hasApiErrorShape(exceptionResponse)) {
      return exceptionResponse;
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return this.createErrorBody('UNAUTHENTICATED', '尚未登入');
    }

    if (status === HttpStatus.FORBIDDEN) {
      return this.createErrorBody('FORBIDDEN', '權限不足');
    }

    if (status === HttpStatus.BAD_REQUEST) {
      return this.createErrorBody('VALIDATION_ERROR', '輸入資料驗證失敗');
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return this.createErrorBody('RATE_LIMITED', '請求過於頻繁');
    }

    return this.createErrorBody('INTERNAL_ERROR', '未預期錯誤');
  }

  // 檢查例外內容是否已經是 API 契約要求的錯誤格式。
  private hasApiErrorShape(value: unknown): value is ApiErrorBody {
    if (!value || typeof value !== 'object' || !('error' in value)) {
      return false;
    }

    const error = (value as { error: unknown }).error;

    return (
      Boolean(error) &&
      typeof error === 'object' &&
      typeof (error as { code?: unknown }).code === 'string' &&
      typeof (error as { message?: unknown }).message === 'string'
    );
  }

  // 建立標準錯誤回應，避免各 controller 重複手刻 error 外層格式。
  private createErrorBody(code: string, message: string): ApiErrorBody {
    return {
      error: {
        code,
        message,
      },
    };
  }
}
