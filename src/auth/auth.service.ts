import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { RegistrationDto } from './dtos/registration.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
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

@Injectable()
export class AuthService {
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

    async registration(registrationData: RegistrationDto) {
        const { email, password, name, verificationCode } = registrationData;

        const isValid = this.verificationService.verifyCode(
            email,
            verificationCode,
        );

        if (!isValid) {
            throw new BadRequestException(
                'Invalid or expired verification code',
            );
        }

        const emailInUse = await this.UserModel.findOne({
            email: registrationData.email,
        });

        if (emailInUse) {
            throw new BadRequestException('Email already in use');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await this.UserModel.create({
            name,
            email,
            password: hashedPassword,
        });

        await this.AllTransactionsInfoModel.create({
            userId: newUser._id,
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

        return {
            message: 'Registration successful, please login',
        };
    }

    async login(loginData: LoginDto, context: SessionContext = {}) {
        const { email, password } = loginData;

        const user = await this.UserModel.findOne({ email });

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
        const user = await this.UserModel.findOne({ email });
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

            await this.mailService.sendPasswordResetEmail(email, resetToken);
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
        const { email, name, picture } = profile;

        let user = await this.UserModel.findOne({ email });

        if (!user) {
            user = await this.UserModel.create({
                name,
                email,
                avatar: picture,
                registeredVia: 'google',
                password: null,
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
    async requestEmailCode(email: string) {
        const code = this.verificationService.createCode(email);
        await this.mailService.sendEmailVerificationCode(email, code);
        return { message: 'Verification code sent to email' };
    }
}
