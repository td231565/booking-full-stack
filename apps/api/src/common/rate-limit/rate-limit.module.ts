import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../../modules/auth/auth.module';
import { ContractRateLimitGuard } from './contract-rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [AuthModule],
  providers: [
    RateLimitService,
    ContractRateLimitGuard,
    {
      provide: APP_GUARD,
      useClass: ContractRateLimitGuard,
    },
  ],
  exports: [RateLimitService],
})
export class RateLimitModule {}
