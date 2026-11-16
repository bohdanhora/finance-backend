import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedRequest } from 'src/app.controller';
import { AllTransactionsInfo } from './schemas/all-info.schema';
import {
    PetBuyDto,
    PetEquipDto,
    PetProfileDto,
    PetSyncDto,
} from './dtos/pet.dto';
import {
    FREEZE_LIMIT,
    FREEZE_PRICE,
    PET_ITEMS,
    PetState,
    buyPetItem,
    collectPetRewards,
    equipPetItem,
    normalizePetState,
    renamePet,
    toPublicPet,
} from './helpers/pet';
import { resolveVisitDay } from './helpers/streak';

const PURCHASE_ERRORS = {
    unknown: 'Unknown item',
    owned: 'Item already owned',
    coins: 'Not enough coins',
    limit: 'Freeze limit reached',
};

@Injectable()
export class PetService {
    constructor(
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
    ) {}

    private getUserIdOrThrow(req: AuthenticatedRequest): string {
        if (!req.userId) {
            throw new UnauthorizedException('User ID not found');
        }
        if (!Types.ObjectId.isValid(req.userId)) {
            throw new BadRequestException('Invalid userId format');
        }
        return req.userId;
    }

    private async load(userId: string) {
        const userData = await this.AllTransactionsInfoModel.findOne({
            userId,
        });
        if (!userData) {
            throw new BadRequestException('User data not found');
        }
        return userData;
    }

    private readPet(userData: { pet?: unknown }): PetState {
        const stored = userData.pet as
            | (Partial<PetState> & { toObject?: () => Partial<PetState> })
            | undefined;
        return normalizePetState(stored?.toObject?.() ?? stored ?? null);
    }

    private async save(userId: string, pet: PetState) {
        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { pet } },
        );
    }

    private respond(pet: PetState, extra: Record<string, unknown> = {}) {
        return {
            pet: toPublicPet(pet),
            catalog: PET_ITEMS,
            freeze: { price: FREEZE_PRICE, limit: FREEZE_LIMIT },
            ...extra,
        };
    }

    async getPet(req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.load(userId);
        return this.respond(this.readPet(userData));
    }

    async sync({ day, offset }: PetSyncDto, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.load(userId);
        const pet = this.readPet(userData);

        const { state, granted } = collectPetRewards(pet, {
            day: resolveVisitDay(day),
            offsetMinutes: offset ?? 0,
            streak: userData.streak
                ? {
                      lastVisit: userData.streak.lastVisit,
                      current: userData.streak.current,
                  }
                : null,
            transactions: userData.transactions || [],
            savings: userData.savingsOperations || [],
            bills: userData.essentialsArray || [],
        });

        if (granted.length > 0) {
            await this.save(userId, state);
        }

        return this.respond(state, { granted });
    }

    async buy({ itemId }: PetBuyDto, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.load(userId);
        const result = buyPetItem(this.readPet(userData), itemId);

        if (!result.ok) {
            throw new BadRequestException(PURCHASE_ERRORS[result.reason]);
        }

        await this.save(userId, result.state);
        return this.respond(result.state);
    }

    async equip({ slot, itemId }: PetEquipDto, req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.load(userId);
        const next = equipPetItem(this.readPet(userData), slot, itemId);

        if (!next) {
            throw new BadRequestException('Item cannot be equipped');
        }

        await this.save(userId, next);
        return this.respond(next);
    }

    async updateProfile(
        { species, name }: PetProfileDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const userData = await this.load(userId);
        let pet = this.readPet(userData);

        if (species) pet = { ...pet, species };
        if (name !== undefined) pet = renamePet(pet, name);

        await this.save(userId, pet);
        return this.respond(pet);
    }
}
