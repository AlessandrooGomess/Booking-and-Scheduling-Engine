import { subject } from '@casl/ability';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { Action, CaslAbilityFactory } from '../casl/casl-ability.factory.js';
import { BookingStatus, UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resourcesService: ResourcesService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateBookingDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const now = new Date();

    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be strictly after startsAt');
    }

    const resource = await this.resourcesService.findOne(dto.resourceId);

    if (!resource.isActive) {
      throw new BadRequestException('Resource is not active for bookings');
    }

    const minAllowedStart = new Date(
      now.getTime() + resource.minAdvanceMinutes * 60_000,
    );
    if (startsAt < minAllowedStart) {
      throw new BadRequestException(
        `Bookings for this resource require at least ${resource.minAdvanceMinutes} minutes of advance notice`,
      );
    }

    const maxAllowedStart = new Date(
      now.getTime() + resource.maxAdvanceDays * 86_400_000,
    );
    if (startsAt > maxAllowedStart) {
      throw new BadRequestException(
        `Bookings for this resource cannot be scheduled more than ${resource.maxAdvanceDays} days in advance`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const overlappingMaintenance = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "maintenance_blocks"
          WHERE "resource_id" = ${dto.resourceId}::uuid
            AND "period" && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz, '[)')
          LIMIT 1
        `;

        if (overlappingMaintenance.length > 0) {
          throw new ConflictException(
            'Resource is under scheduled maintenance during the requested period',
          );
        }

        return tx.booking.create({
          data: {
            resourceId: dto.resourceId,
            userId: user.id,
            status: BookingStatus.CONFIRMED,
            startsAt,
            endsAt,
          },
        });
      });
    } catch (error) {
      if (this.isExclusionConstraintError(error)) {
        throw new ConflictException(
          'Resource is already booked or held during the requested time slot',
        );
      }
      throw error;
    }
  }

  async findAll(user: AuthenticatedUser) {
    const where =
      user.role === UserRole.ADMIN ? {} : { userId: user.id };

    return this.prisma.booking.findMany({
      where,
      include: {
        resource: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        resource: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with id "${id}" not found`);
    }

    const ability = this.caslAbilityFactory.createForUser(user);
    if (!ability.can(Action.Read, subject('Booking', booking))) {
      throw new ForbiddenException('You can only view your own bookings');
    }

    return booking;
  }

  async cancel(id: string, user: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        resource: true,
      },
    });

    if (!booking) {
      throw new NotFoundException(`Booking with id "${id}" not found`);
    }

    const ability = this.caslAbilityFactory.createForUser(user);
    if (!ability.can(Action.Cancel, subject('Booking', booking))) {
      throw new ForbiddenException('You can only cancel your own bookings');
    }

    if (
      booking.status !== BookingStatus.CONFIRMED &&
      booking.status !== BookingStatus.HOLD
    ) {
      throw new BadRequestException(
        `Cannot cancel a booking with status "${booking.status}"`,
      );
    }

    const now = new Date();

    if (user.role !== UserRole.ADMIN) {
      const cancellationDeadline = new Date(
        booking.startsAt.getTime() -
          booking.resource.cancellationNoticeMinutes * 60_000,
      );

      if (now > cancellationDeadline) {
        throw new BadRequestException(
          `Bookings for this resource must be cancelled at least ${booking.resource.cancellationNoticeMinutes} minutes before start time`,
        );
      }
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: now,
      },
    });
  }

  private isExclusionConstraintError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const causeCode = (
      error as {
        meta?: { driverAdapterError?: { cause?: { code?: string } } };
      }
    ).meta?.driverAdapterError?.cause?.code;

    return (
      causeCode === '23P01' ||
      error.message.includes('23P01') ||
      error.message.includes(
        'conflicting key value violates exclusion constraint',
      )
    );
  }
}