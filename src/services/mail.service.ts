import nodemailer, { SendMailOptions } from 'nodemailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter;

    constructor(private configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('nodemailer.host'),
            port: this.configService.get<number>('nodemailer.port'),
            auth: {
                user: this.configService.get<string>('nodemailer.user'),
                pass: this.configService.get<string>('nodemailer.pass'),
            },
        });
    }

    async sendPasswordResetEmail(to: string, token: string): Promise<void> {
        const resetLink = `https://finance-front-zeta.vercel.app/reset-password?token=${token}`;
        const mailOptions: SendMailOptions = {
            from: 'Finance-app-backend service',
            to,
            subject: 'Password Reset Request',
            html: `<p>You requested a password reset. Click the link below to reset your password:</p>
             <p><a href="${resetLink}">Reset Password</a></p>`,
        };

        await this.transporter.sendMail(mailOptions);
    }

    async sendEmailVerificationCode(to: string, code: string): Promise<void> {
        const mailOptions: SendMailOptions = {
            from: 'Finance-app-backend service',
            to,
            subject: 'Email Verification Code',
            html: `<p>Your verification code is: <b>${code}</b></p>`,
        };

        await this.transporter.sendMail(mailOptions);
    }
}
