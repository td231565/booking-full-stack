import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const SERVICE_STATUSES = ['active', 'inactive', 'hidden'] as const;
const SLOT_STATUSES = ['available', 'blocked', 'inactive'] as const;

export class CreateAdminServiceDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsInt()
  @Min(0)
  price!: number;

  @IsIn(SERVICE_STATUSES)
  status!: (typeof SERVICE_STATUSES)[number];
}

export class UpdateAdminServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsIn(SERVICE_STATUSES)
  status?: (typeof SERVICE_STATUSES)[number];
}

export class CreateAdminAvailabilitySlotDto {
  @IsUUID()
  serviceId!: string;

  @IsISO8601()
  startAt!: string;

  @IsISO8601()
  endAt!: string;

  @IsIn(SLOT_STATUSES)
  status!: (typeof SLOT_STATUSES)[number];
}

export class UpdateAdminAvailabilitySlotDto {
  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  endAt?: string;

  @IsOptional()
  @IsIn(SLOT_STATUSES)
  status?: (typeof SLOT_STATUSES)[number];
}

export class BulkGenerateAvailabilitySlotsDto {
  @IsUUID()
  serviceId!: string;

  @IsIn(['Asia/Taipei'])
  timezone!: 'Asia/Taipei';

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo!: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays!: number[];

  @IsArray()
  timeRanges!: Array<{
    startTime: string;
    endTime: string;
  }>;
}

export class CreateAdminBookingDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  availabilitySlotId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateAdminBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsUUID()
  availabilitySlotId?: string;
}

export class CancelAdminBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
