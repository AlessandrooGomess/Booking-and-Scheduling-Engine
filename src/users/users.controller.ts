import { subject } from '@casl/ability';
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { Action, CaslAbilityFactory } from '../casl/casl-ability.factory.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Manage, 'User'))
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const ability = this.caslAbilityFactory.createForUser(user);

    if (!ability.can(Action.Read, subject('User', { id }))) {
      throw new ForbiddenException('You can only view your own user profile');
    }

    return this.usersService.findOne(id);
  }
}