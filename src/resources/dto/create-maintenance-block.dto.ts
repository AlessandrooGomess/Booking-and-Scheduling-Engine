import {
  IsDateString,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMaintenanceBlockDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}