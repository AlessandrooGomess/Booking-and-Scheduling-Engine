import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { BookingStatus, ResourceType } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Bookings High-Concurrency & Temporal Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let resourceId: string;

  const baseStart = new Date(Date.now() + 48 * 3_600_000);
  baseStart.setUTCMinutes(0, 0, 0);

  const slot14to16 = {
    startsAt: new Date(baseStart.getTime()).toISOString(),
    endsAt: new Date(baseStart.getTime() + 2 * 3_600_000).toISOString(),
  };

  const slot15to17Overlapping = {
    startsAt: new Date(baseStart.getTime() + 1 * 3_600_000).toISOString(),
    endsAt: new Date(baseStart.getTime() + 3 * 3_600_000).toISOString(),
  };

  const slot16to17Adjacent = {
    startsAt: new Date(baseStart.getTime() + 2 * 3_600_000).toISOString(),
    endsAt: new Date(baseStart.getTime() + 3 * 3_600_000).toISOString(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);

    const uniqueEmail = `concurrency-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Concurrency Tester',
        email: uniqueEmail,
        password: 'Password123!',
      })
      .expect(201);

    accessToken = registerRes.body.accessToken;
    userId = registerRes.body.user.id;

    const resource = await prisma.resource.create({
      data: {
        name: `Sala Alta Concorrência ${Date.now()}`,
        type: ResourceType.ROOM,
        minAdvanceMinutes: 60,
        maxAdvanceDays: 30,
        cancellationNoticeMinutes: 120,
      },
    });

    resourceId = resource.id;
  }, 30_000);

  afterAll(async () => {
    if (prisma && resourceId) {
      await prisma.booking.deleteMany({ where: { resourceId } });
      await prisma.resource.delete({ where: { id: resourceId } });
    }
    if (prisma && userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    if (app) {
      await app.close();
    }
  }, 30_000);

  it('should allow exactly 1 booking and reject 19 with 409 Conflict under 20 simultaneous requests', async () => {
    const concurrentRequests = 20;

    const responses = await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        request(app.getHttpServer())
          .post('/bookings')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            resourceId,
            startsAt: slot14to16.startsAt,
            endsAt: slot14to16.endsAt,
          }),
      ),
    );

    const created = responses.filter((res) => res.status === 201);
    const conflicts = responses.filter((res) => res.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(concurrentRequests - 1);

    const activeCountInDb = await prisma.booking.count({
      where: {
        resourceId,
        status: BookingStatus.CONFIRMED,
      },
    });

    expect(activeCountInDb).toBe(1);
  }, 30_000);

  it('should reject partially overlapping booking [15:00, 17:00) against [14:00, 16:00) with 409 Conflict', async () => {
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceId,
        startsAt: slot15to17Overlapping.startsAt,
        endsAt: slot15to17Overlapping.endsAt,
      })
      .expect(409);
  }, 15_000);

  it('should allow adjacent booking [16:00, 17:00) right after [14:00, 16:00) thanks to half-open range [)', async () => {
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceId,
        startsAt: slot16to17Adjacent.startsAt,
        endsAt: new Date(baseStart.getTime() + 3 * 3_600_000).toISOString(),
      })
      .expect(201);
  }, 15_000);

  it('should free the time slot in the partial GiST index when the booking is cancelled', async () => {
    const existingBooking = await prisma.booking.findFirstOrThrow({
      where: {
        resourceId,
        startsAt: new Date(slot14to16.startsAt),
        status: BookingStatus.CONFIRMED,
      },
    });

    await request(app.getHttpServer())
      .patch(`/bookings/${existingBooking.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        resourceId,
        startsAt: slot14to16.startsAt,
        endsAt: slot14to16.endsAt,
      })
      .expect(201);
  }, 20_000);
});