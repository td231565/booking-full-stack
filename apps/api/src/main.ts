import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';

// 啟動 NestJS HTTP 服務，並集中掛載 API prefix、驗證與錯誤格式。
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.use(requestIdMiddleware);

  // 允許前端以 credentials 呼叫 API；本機預設同時開放 localhost 與 127.0.0.1，避免網址不一致被 CORS 擋下。
  const webOrigins = Array.from(
    new Set([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
    ]),
  );
  app.enableCors({
    origin: webOrigins,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap();
