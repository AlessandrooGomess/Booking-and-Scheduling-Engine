import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { Action } from '../casl/casl-ability.factory.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, 'Booking'))
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user, dto);
  }

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Booking'))
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findOne(id, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.cancel(id, user);
  }
}