import { HttpException } from '@nestjs/common';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiException extends HttpException {
  public readonly code: string;

  // 建立帶有穩定錯誤碼的 HTTP exception，讓前端能依 error.code 呈現固定 UI。
  constructor(status: number, code: string, message: string) {
    super(
      {
        error: {
          code,
          message,
        },
      } satisfies ApiErrorBody,
      status,
    );
    this.code = code;
  }
}
