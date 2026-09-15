import {
    BadRequestException,
    Injectable,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedRequest } from 'src/app.controller';
import { AllTransactionsInfo } from './schemas/all-info.schema';
import {
    AssistantPreferencesDto,
    MonobankTokenDto,
} from './dtos/connections.dto';
import { normalizeAssistantPreferences } from './helpers/assistant-preferences';
import {
    decryptSecret,
    deriveEncryptionKey,
    EncryptedSecret,
    encryptSecret,
} from './helpers/secret-cipher';

@Injectable()
export class ConnectionsService {
    private readonly key: Buffer | null;

    constructor(
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        configService: ConfigService,
    ) {
        const secret = configService.get<string>('connections.secret');
        this.key = secret ? deriveEncryptionKey(secret) : null;
    }

    private getUserIdOrThrow(req: AuthenticatedRequest): string {
        if (!req.userId) {
            throw new UnauthorizedException('User ID not found');
        }
        if (!Types.ObjectId.isValid(req.userId)) {
            throw new BadRequestException('Invalid userId format');
        }
        return req.userId;
    }

    private readToken(secret?: EncryptedSecret): string | null {
        if (!secret || !this.key) return null;

        try {
            return decryptSecret(secret, this.key);
        } catch {
            return null;
        }
    }

    async getConnections(req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);

        const userData = await this.AllTransactionsInfoModel.findOne({
            userId,
        }).select('+monobankToken');
        if (!userData) {
            throw new BadRequestException('User data not found');
        }

        return {
            assistant: userData.assistantPreferences || null,
            monobankToken: this.readToken(userData.monobankToken),
        };
    }

    async setAssistantPreferences(
        data: AssistantPreferencesDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);
        const assistant = normalizeAssistantPreferences(data);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { assistantPreferences: assistant } },
        );

        return {
            message: 'Assistant preferences saved',
            assistant,
        };
    }

    async setMonobankToken(
        { token }: MonobankTokenDto,
        req: AuthenticatedRequest,
    ) {
        const userId = this.getUserIdOrThrow(req);

        if (!this.key) {
            throw new ServiceUnavailableException(
                'Connections secret is not configured',
            );
        }

        const monobankToken = token.trim();
        if (!monobankToken) {
            throw new BadRequestException('Token is empty');
        }

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $set: { monobankToken: encryptSecret(monobankToken, this.key) } },
        );

        return {
            message: 'Monobank token saved',
            monobankToken,
        };
    }

    async clearMonobankToken(req: AuthenticatedRequest) {
        const userId = this.getUserIdOrThrow(req);

        await this.AllTransactionsInfoModel.updateOne(
            { userId },
            { $unset: { monobankToken: '' } },
        );

        return {
            message: 'Monobank token removed',
            monobankToken: null,
        };
    }
}
