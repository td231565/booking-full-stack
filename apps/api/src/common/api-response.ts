export type ApiSuccessResponse<T> = {
  data: T;
};

export type ApiListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiListResponse<T> = {
  data: T[];
  meta: ApiListMeta;
};

// 包裝單筆成功回應，確保所有 controller 使用一致的 data 外層格式。
export function successResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    data,
  };
}

// 包裝列表成功回應，確保分頁 meta 與 API 契約一致。
export function listResponse<T>(data: T[], meta: ApiListMeta): ApiListResponse<T> {
  return {
    data,
    meta,
  };
}

// 包裝無內容成功回應，讓 delete/logout 類操作仍維持 data: null。
export function noContentResponse(): ApiSuccessResponse<null> {
  return {
    data: null,
  };
}
