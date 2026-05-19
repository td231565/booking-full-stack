import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BookingModule } from './modules/booking/booking.module';
import { ServiceCatalogModule } from './modules/service-catalog/service-catalog.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RateLimitModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    ServiceCatalogModule,
    AvailabilityModule,
    BookingModule,
    AdminModule,
    AuditLogModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
