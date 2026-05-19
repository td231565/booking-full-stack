import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingController } from './booking.controller';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';

@Module({
  imports: [AuthModule],
  controllers: [BookingController],
  providers: [BookingService, BookingRepository],
  exports: [BookingService],
})
export class BookingModule {}
