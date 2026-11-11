import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory.js';
import { PoliciesGuard } from './guards/policies.guard.js';

@Global()
@Module({
  providers: [
    CaslAbilityFactory,
    {
      provide: APP_GUARD,
      useClass: PoliciesGuard,
    },
  ],
  exports: [CaslAbilityFactory],
})
export class CaslModule {}