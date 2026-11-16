import {
    Body,
    Controller,
    Get,
    Post,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from 'src/app.controller';
import { AuthGuard } from 'src/guards/auth.guard';
import { PetService } from './pet.service';
import {
    PetBuyDto,
    PetEquipDto,
    PetProfileDto,
    PetSyncDto,
} from './dtos/pet.dto';

@UseGuards(AuthGuard)
@Controller('transactions/pet')
export class PetController {
    constructor(private readonly petService: PetService) {}

    @Get()
    async getPet(@Req() req: AuthenticatedRequest) {
        return this.petService.getPet(req);
    }

    @Post('sync')
    async sync(@Body() data: PetSyncDto, @Req() req: AuthenticatedRequest) {
        return this.petService.sync(data, req);
    }

    @Post('buy')
    async buy(@Body() data: PetBuyDto, @Req() req: AuthenticatedRequest) {
        return this.petService.buy(data, req);
    }

    @Put('equip')
    async equip(@Body() data: PetEquipDto, @Req() req: AuthenticatedRequest) {
        return this.petService.equip(data, req);
    }

    @Put('profile')
    async updateProfile(
        @Body() data: PetProfileDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.petService.updateProfile(data, req);
    }
}
