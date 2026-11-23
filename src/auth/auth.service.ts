import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { ClaimEmailDto, RegistrationDto } from './dtos/registration.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument, isEmailVerified } from './schemas/user.schema';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dtos/login.dto';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { SessionContext, SessionsService } from 'src/sessions/sessions.service';
import { SessionEndReason, SessionMethod } from 'src/sessions/session.schema';
import { ResetToken } from './schemas/reset-token.schema';
import { MailService } from 'src/services/mail.service';
import { LogoutDto } from './dtos/logout.dto';
import { AllTransactionsInfo } from 'src/transactions/schemas/all-info.schema';
import { VerificationService } from 'src/services/verification.service';
import { ConfigService } from '@nestjs/config';
import { toMonthKey } from 'src/transactions/helpers/month-rollover';

const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

export const normaliseEmail = (email: string): string =>
    email.trim().toLowerCase();

const emailTaken = (verified: boolean) =>
    new ConflictException({
        message: verified
            ? 'An account with this email already exists'
            : 'This email belongs to an account that was never confirmed',
        code: verified ? 'EMAIL_TAKEN' : 'EMAIL_UNVERIFIED',
    });

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectModel(User.name) private UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        private sessionsService: SessionsService,
        @InjectModel(ResetToken.name)
        private ResetTokenModel: Model<ResetToken>,
        private jwtService: JwtService,
        private mailService: MailService,
        private verificationService: VerificationService,
        private configService: ConfigService,
    ) {}

    private findByEmail(email: string) {
        return this.UserModel.findOne({
            email: normaliseEmail(email),
        }).collation(CASE_INSENSITIVE);
    }

    private async createFinances(userId: Types.ObjectId) {
        await this.AllTransactionsInfoModel.create({
            userId,
            totalAmount: 0,
            totalIncome: 0,
            totalSpend: 0,
            nextMonthTotalAmount: 0,
            savePercent: 0,
            lastProcessedMonth: toMonthKey(),
            defaultEssentialsArray: [],
            essentialsArray: [],
            nextMonthEssentialsArray: [],
            transactions: [],
            savingsGoals: [],
            savingsOperations: [],
        });
    }

    private async sendVerificationCode(email: string) {
        const code = await this.verificationService.createCode(email);
        await this.mailService.sendEmailVerificationCode(email, code);
    }

    async registration(
        registrationData: RegistrationDto,
        context: SessionContext = {},
    ) {
        const { password, name, verificationCode } = registrationData;
        const email = normaliseEmail(registrationData.email);

        const existing = await this.findByEmail(email);
        if (existing) {
            throw emailTaken(isEmailVerified(existing));
        }

        let emailVerified = false;
        if (verificationCode) {
            emailVerified = await this.verificationService.verifyCode(
                email,
                verificationCode,
            );
            if (!emailVerified) {
                throw new BadRequestException(
                    'Invalid or expired verification code',
                );
            }
        }

        const newUser = await this.UserModel.create({
            name,
            email,
            password: await bcrypt.hash(password, 10),
            emailVerified,
        });
        await this.createFinances(newUser._id);

        if (!emailVerified) {
            this.sendVerificationCode(email).catch((error: unknown) =>
                this.logger.warn(
                    `Verification code was not sent to ${email}: ${String(error)}`,
                ),
            );
        }

        const tokens = await this.generateUserTokens(
            newUser._id.toString(),
            SessionMethod.PASSWORD,
            context,
        );

        return { message: 'Registration successful', ...tokens };
    }

    async claimEmail(data: ClaimEmailDto, context: SessionContext = {}) {
        const email = normaliseEmail(data.email);
        const existing = await this.findByEmail(email);

        if (existing && isEmailVerified(existing)) {
            throw emailTaken(true);
        }

        const valid = await this.verificationService.verifyCode(
            email,
            data.verificationCode,
        );
        if (!valid) {
            throw new BadRequestException(
                'Invalid or expired verification code',
            );
        }

        if (existing) {
            const oldId = existing._id.toString();
            await this.sessionsService.endAll(
                oldId,
                SessionEndReason.EMAIL_CLAIMED,
            );
            await Promise.all([
                this.ResetTokenModel.deleteMany({ userId: existing._id }),
                this.AllTransactionsInfoModel.deleteMany({
                    userId: { $in: [oldId, existing._id] },
                }),
                this.UserModel.deleteOne({ _id: existing._id }),
            ]);
        }

        const newUser = await this.UserModel.create({
            name: data.name,
            email,
            password: await bcrypt.hash(data.password, 10),
            emailVerified: true,
        });
        await this.createFinances(newUser._id);

        const tokens = await this.generateUserTokens(
            newUser._id.toString(),
            SessionMethod.PASSWORD,
            context,
        );

        return { message: 'Registration successful', ...tokens };
    }

    async requestOwnVerification(userId: string) {
        const user = await this.UserModel.findById(userId);
        if (!user) throw new NotFoundException('User not found');
        if (isEmailVerified(user)) {
            return { message: 'Email already confirmed', emailVerified: true };
        }

        await this.sendVerificationCode(user.email);
        return {
            message: 'Verification code sent to email',
            emailVerified: false,
        };
    }

    async verifyOwnEmail(userId: string, code: string) {
        const user = await this.UserModel.findById(userId);
        if (!user) throw new NotFoundException('User not found');
        if (isEmailVerified(user)) {
            return { message: 'Email already confirmed', emailVerified: true };
        }

        const valid = await this.verificationService.verifyCode(
            user.email,
            code,
        );
        if (!valid) {
            throw new BadRequestException({
                message: 'Invalid or expired verification code',
                code: 'INVALID_CODE',
            });
        }

        user.emailVerified = true;
        await user.save();
        return { message: 'Email confirmed', emailVerified: true };
    }

    async login(loginData: LoginDto, context: SessionContext = {}) {
        const { email, password } = loginData;

        const user = await this.findByEmail(email);

        if (!user) {
            throw new UnauthorizedException('Wrong Credentials');
        }

        if (!user.password) {
            throw new UnauthorizedException('Password missing');
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            throw new UnauthorizedException('Wrong Credentials');
        }

        return this.generateUserTokens(
            user._id.toString(),
            SessionMethod.PASSWORD,
            context,
        );
    }

    async refreshTokens(refreshToken: string, context: SessionContext = {}) {
        const session = await this.sessionsService.rotate(
            refreshToken,
            context,
        );

        if (!session) {
            throw new UnauthorizedException();
        }

        return this.signTokens(session);
    }

    async generateUserTokens(
        userOrId: string | UserDocument,
        method: SessionMethod,
        context: SessionContext = {},
    ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
        const userId =
            typeof userOrId === 'string' ? userOrId : userOrId._id.toString();

        if (!Types.ObjectId.isValid(userId)) {
            throw new BadRequestException('Invalid userId format');
        }

        const session = await this.sessionsService.start(
            userId,
            method,
            context,
        );

        return this.signTokens(session);
    }

    private signTokens({
        sessionId,
        userId,
        refreshToken,
    }: {
        sessionId: string;
        userId: string;
        refreshToken: string;
    }) {
        const accessToken = this.jwtService.sign(
            { userId, sid: sessionId },
            {
                expiresIn:
                    this.configService.get<string>('jwt.accessTokenTtl')!,
            },
        );

        return { accessToken, refreshToken, userId };
    }

    async getAccount(userId: string) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new BadRequestException('Invalid userId format');
        }

        const user = await this.UserModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        return {
            name: user.name,
            email: user.email,
            registeredVia: user.registeredVia,
            hasPassword: Boolean(user.password),
            emailVerified: isEmailVerified(user),
        };
    }

    async changePassword(
        userId: string,
        {
            oldPassword,
            newPassword,
        }: { oldPassword?: string; newPassword: string },
        sessionId?: string,
    ) {
        if (!Types.ObjectId.isValid(userId)) {
            throw new BadRequestException('Invalid userId format');
        }

        const user = await this.UserModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.password) {
            if (!oldPassword) {
                throw new BadRequestException('Current password is required');
            }

            const isCompare = await bcrypt.compare(oldPassword, user.password);
            if (!isCompare) {
                throw new BadRequestException('Wrong current password');
            }
        }

        const created = !user.password;
        user.password = await bcrypt.hash(newPassword, 10);

        await user.save();
        await this.sessionsService.endAll(
            userId,
            SessionEndReason.PASSWORD_CHANGED,
            sessionId,
        );

        return {
            message: created ? 'Password created' : 'Password changed',
        };
    }

    async forgotPassword({ email }: { email: string }) {
        const user = await this.findByEmail(email);
        if (user && !isEmailVerified(user)) {
            throw new BadRequestException({
                message:
                    'This email was never confirmed, so the password cannot be reset by email',
                code: 'EMAIL_UNVERIFIED',
            });
        }
        if (user) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 1);

            const resetToken = uuidv4();

            await this.ResetTokenModel.deleteMany({ userId: user._id });

            await this.ResetTokenModel.create({
                token: resetToken,
                userId: user._id,
                expiryDate,
            });

            await this.mailService.sendPasswordResetEmail(
                user.email,
                resetToken,
            );
        }

        return { message: 'If user exists, they will receive an email' };
    }

    async resetPassword({
        resetToken,
        newPassword,
    }: {
        resetToken: string;
        newPassword: string;
    }) {
        const token = await this.ResetTokenModel.findOneAndDelete({
            token: resetToken,
            expiryDate: { $gte: new Date() },
        });

        if (!token) {
            throw new UnauthorizedException('Invalid link');
        }

        if (!Types.ObjectId.isValid(token.userId)) {
            throw new BadRequestException('Invalid userId format');
        }

        const user = await this.UserModel.findById(token.userId);
        if (!user) {
            throw new InternalServerErrorException();
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        await this.sessionsService.endAll(
            user._id.toString(),
            SessionEndReason.PASSWORD_RESET,
        );

        return {
            message: 'Success reset',
        };
    }

    async logout({ refreshToken }: LogoutDto) {
        if (refreshToken) {
            await this.sessionsService.endByRefreshToken(refreshToken);
        }

        return {
            message: 'Success logout',
        };
    }

    async validateOAuthLogin(profile: {
        email: string;
        name: string;
        picture: string;
    }): Promise<User> {
        const { name, picture } = profile;
        const email = normaliseEmail(profile.email);

        let user = await this.findByEmail(email);

        if (user && !isEmailVerified(user)) {
            const userId = user._id.toString();
            user.emailVerified = true;
            user.password = undefined;
            await user.save();
            await this.sessionsService.endAll(
                userId,
                SessionEndReason.EMAIL_CLAIMED,
            );
        }

        if (!user) {
            user = await this.UserModel.create({
                name,
                email,
                avatar: picture,
                registeredVia: 'google',
                password: null,
                emailVerified: true,
            });

            await this.AllTransactionsInfoModel.create({
                userId: user._id,
                totalAmount: 0,
                totalIncome: 0,
                totalSpend: 0,
                nextMonthTotalAmount: 0,
                savePercent: 0,
                lastProcessedMonth: toMonthKey(),
                defaultEssentialsArray: [],
                essentialsArray: [],
                nextMonthEssentialsArray: [],
                transactions: [],
                savingsGoals: [],
                savingsOperations: [],
            });
        }

        return user;
    }
    async requestEmailCode(rawEmail: string) {
        await this.sendVerificationCode(normaliseEmail(rawEmail));
        return { message: 'Verification code sent to email' };
    }
}
