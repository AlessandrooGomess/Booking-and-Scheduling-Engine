import {
  AbilityBuilder,
  createMongoAbility,
  ForcedSubject,
  MongoAbility,
} from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { UserRole } from '../generated/prisma/client.js';

export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  Cancel = 'cancel',
}

export type Subjects =
  | 'User'
  | 'Resource'
  | 'MaintenanceBlock'
  | 'Booking'
  | 'WaitlistEntry'
  | (ForcedSubject<'User'> & { id: string })
  | (ForcedSubject<'Booking'> & { userId: string })
  | (ForcedSubject<'WaitlistEntry'> & { userId: string })
  | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: AuthenticatedUser): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (user.role === UserRole.ADMIN) {
      can(Action.Manage, 'all');
    } else {
      can(Action.Read, 'Resource');
      can(Action.Read, 'User', { id: user.id });

      can(Action.Create, 'Booking');
      can(Action.Read, 'Booking', { userId: user.id });
      can(Action.Cancel, 'Booking', { userId: user.id });

      can(Action.Create, 'WaitlistEntry');
      can(Action.Read, 'WaitlistEntry', { userId: user.id });
      can(Action.Cancel, 'WaitlistEntry', { userId: user.id });
    }

    return build();
  }
}