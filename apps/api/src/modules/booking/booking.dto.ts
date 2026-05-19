import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  availabilitySlotId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
