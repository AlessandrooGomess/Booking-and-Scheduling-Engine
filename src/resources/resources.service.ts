import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMaintenanceBlockDto } from './dto/create-maintenance-block.dto.js';
import { CreateResourceDto } from './dto/create-resource.dto.js';
import { QueryAvailabilityDto } from './dto/query-availability.dto.js';

interface OverlappingBookingRow {
  id: string;
  status: BookingStatus;
  starts_at: Date;
  ends_at: Date;
}

interface OverlappingMaintenanceRow {
  id: string;
  reason: string;
  starts_at: Date;
  ends_at: Date;
}

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateResourceDto) {
    return this.prisma.resource.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type,
        isActive: dto.isActive ?? true,
        minAdvanceMinutes: dto.minAdvanceMinutes ?? 60,
        maxAdvanceDays: dto.maxAdvanceDays ?? 30,
        cancellationNoticeMinutes: dto.cancellationNoticeMinutes ?? 120,
      },
    });
  }

  async findAll() {
    return this.prisma.resource.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException(`Resource with id "${id}" not found`);
    }

    return resource;
  }

  async createMaintenanceBlock(
    resourceId: string,
    dto: CreateMaintenanceBlockDto,
  ) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be strictly after startsAt');
    }

    await this.findOne(resourceId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const conflictingBookings = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "bookings"
          WHERE "resource_id" = ${resourceId}::uuid
            AND "status" IN ('CONFIRMED'::"booking_status", 'HOLD'::"booking_status")
            AND "period" && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz, '[)')
          LIMIT 1
        `;

        if (conflictingBookings.length > 0) {
          throw new ConflictException(
            'Cannot schedule maintenance: resource already has an active booking in this period',
          );
        }

        return tx.maintenanceBlock.create({
          data: {
            resourceId,
            reason: dto.reason.trim(),
            startsAt,
            endsAt,
          },
        });
      });
    } catch (error) {
      if (this.isExclusionConstraintError(error)) {
        throw new ConflictException(
          'Maintenance block overlaps with an existing maintenance window for this resource',
        );
      }
      throw error;
    }
  }

  async getAvailability(resourceId: string, query: QueryAvailabilityDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);

    if (to <= from) {
      throw new BadRequestException('to must be strictly after from');
    }

    const resource = await this.findOne(resourceId);

    const [overlappingBookings, overlappingMaintenance] = await Promise.all([
      this.prisma.$queryRaw<OverlappingBookingRow[]>`
        SELECT "id", "status", "starts_at", "ends_at"
        FROM "bookings"
        WHERE "resource_id" = ${resourceId}::uuid
          AND "status" IN ('CONFIRMED'::"booking_status", 'HOLD'::"booking_status")
          AND "period" && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
        ORDER BY "starts_at" ASC
      `,
      this.prisma.$queryRaw<OverlappingMaintenanceRow[]>`
        SELECT "id", "reason", "starts_at", "ends_at"
        FROM "maintenance_blocks"
        WHERE "resource_id" = ${resourceId}::uuid
          AND "period" && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
        ORDER BY "starts_at" ASC
      `,
    ]);

    return {
      resourceId: resource.id,
      resourceName: resource.name,
      isActive: resource.isActive,
      window: { from, to },
      isAvailable:
        resource.isActive &&
        overlappingBookings.length === 0 &&
        overlappingMaintenance.length === 0,
      bookings: overlappingBookings.map((b) => ({
        id: b.id,
        status: b.status,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
      })),
      maintenanceBlocks: overlappingMaintenance.map((m) => ({
        id: m.id,
        reason: m.reason,
        startsAt: m.starts_at,
        endsAt: m.ends_at,
      })),
    };
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
      error.message.includes('conflicting key value violates exclusion constraint')
    );
  }
}