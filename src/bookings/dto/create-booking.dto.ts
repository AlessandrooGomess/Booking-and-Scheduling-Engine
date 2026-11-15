import { IsDateString, IsUUID } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  resourceId: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}