import { Controller, Get } from '@nestjs/common';
import { ApiException } from './common/api-exception';
import { listResponse, successResponse } from './common/api-response';

@Controller('health')
export class HealthController {
  // 提供啟動驗證用的單筆成功回應，固定輸出 api_contract.md 的 data 格式。
  @Get()
  getHealth() {
    return successResponse({
      status: 'ok',
    });
  }

  // 提供啟動驗證用的列表回應，固定輸出 api_contract.md 的 data + meta 格式。
  @Get('list')
  getListHealth() {
    return listResponse([], {
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  }

  // 提供啟動驗證用的錯誤回應，確認全域 filter 會輸出 error.code + error.message。
  @Get('error')
  getErrorHealth(): never {
    throw new ApiException(400, 'VALIDATION_ERROR', '驗證錯誤格式');
  }
}
