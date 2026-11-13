import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Action } from '../casl/casl-ability.factory.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { CreateMaintenanceBlockDto } from './dto/create-maintenance-block.dto.js';
import { CreateResourceDto } from './dto/create-resource.dto.js';
import { QueryAvailabilityDto } from './dto/query-availability.dto.js';
import { ResourcesService } from './resources.service.js';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, 'Resource'))
  create(@Body() dto: CreateResourceDto) {
    return this.resourcesService.create(dto);
  }

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Resource'))
  findAll() {
    return this.resourcesService.findAll();
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Resource'))
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.findOne(id);
  }

  @Get(':id/availability')
  @CheckPolicies((ability) => ability.can(Action.Read, 'Resource'))
  getAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryAvailabilityDto,
  ) {
    return this.resourcesService.getAvailability(id, query);
  }

  @Post(':id/maintenance-blocks')
  @CheckPolicies((ability) => ability.can(Action.Create, 'MaintenanceBlock'))
  createMaintenanceBlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMaintenanceBlockDto,
  ) {
    return this.resourcesService.createMaintenanceBlock(id, dto);
  }
}