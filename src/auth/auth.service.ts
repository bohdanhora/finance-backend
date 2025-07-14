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
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dtos/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshToken } from './schemas/refresh-token.schema';
import { v4 as uuidv4 } from 'uuid';
import { ResetToken } from './schemas/reset-token.schema';
import { MailService } from 'src/services/mail.service';
import { LogoutDto } from './dtos/logout.dto';
import { AllTransactionsInfo } from 'src/transactions/schemas/all-info.schema';
import { VerificationService } from 'src/services/verification.service';

@Injectable()
export class AuthService {
    constructor(
        @InjectModel(User.name) private UserModel: Model<User>,
        @InjectModel(AllTransactionsInfo.name)
        private AllTransactionsInfoModel: Model<AllTransactionsInfo>,
        @InjectModel(RefreshToken.name)
        private RefreshTokenModel: Model<RefreshToken>,
        @InjectModel(ResetToken.name)
        private ResetTokenModel: Model<ResetToken>,
        private jwtService: JwtService,
        private mailService: MailService,
        private verificationService: VerificationService,
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

            defaultEssentialsArray: [],
            essentialsArray: [],
            nextMonthEssentialsArray: [],
            transactions: [],
        });

        return {
            message: 'Registration successful, please login',
        };
    }

    async login(loginData: LoginDto) {
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

        return this.generateUserTokens(user._id.toString());
    }

    async refreshTokens(refreshToken: string) {
        const token: RefreshToken | null = await this.RefreshTokenModel.findOne(
            {
                token: refreshToken,
                expiryDate: { $gte: new Date() },
            },
        );

        if (!token) {
            throw new UnauthorizedException();
        }

        return this.generateUserTokens(token.userId.toString());
    }

    async generateUserTokens(
        userOrId: string | UserDocument,
    ): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
        const userId =
            typeof userOrId === 'string' ? userOrId : userOrId._id.toString();
        const accessToken = this.jwtService.sign(
            { userId },
            { expiresIn: '1h' },
        );
        const refreshToken = uuidv4();

        await this.storeRefreshToken(refreshToken, userId);

        return {
            accessToken,
            refreshToken,
            userId,
        };
    }

    async storeRefreshToken(token: string, userId: string) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 3);

        await this.RefreshTokenModel.updateOne(
            { userId },
            { $set: { expiryDate, token } },
            { upsert: true },
        );
    }

    async changePassword(
        userId: string,
        {
            oldPassword,
            newPassword,
        }: { oldPassword: string; newPassword: string },
    ) {
        const user = await this.UserModel.findById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!user.password) {
            throw new UnauthorizedException('Password missing');
        }
        const isCompare = await bcrypt.compare(oldPassword, user.password);
        if (!isCompare) {
            throw new UnauthorizedException('Wrong credentials');
        }

        const newHashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = newHashedPassword;

        await user.save();
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

        const user = await this.UserModel.findById(token.userId);
        if (!user) {
            throw new InternalServerErrorException();
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return {
            message: 'Success reset',
        };
    }

    async logout({ userId }: LogoutDto) {
        const user = await this.UserModel.findById(userId);

        if (!user) {
            throw new UnauthorizedException('User not found!');
        }

        await this.RefreshTokenModel.findOneAndDelete({ userId });

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
                defaultEssentialsArray: [],
                essentialsArray: [],
                nextMonthEssentialsArray: [],
                transactions: [],
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
