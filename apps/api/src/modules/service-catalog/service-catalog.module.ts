import { Module } from '@nestjs/common';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { ServiceCatalogService } from './service-catalog.service';

@Module({
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService, ServiceCatalogRepository],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
