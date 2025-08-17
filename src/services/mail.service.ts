import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

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

    private loadTemplate(
        templateName: string,
        context: Record<string, any>,
    ): string {
        const templatePath = path.resolve(
            __dirname,
            '../templates',
            `${templateName}.hbs`,
        );
        const templateSource = fs.readFileSync(templatePath, 'utf8');
        const compiledTemplate = handlebars.compile(templateSource);
        return compiledTemplate(context);
    }

    async sendPasswordResetEmail(to: string, token: string): Promise<void> {
        const resetLink = `https://finance-front-zeta.vercel.app/reset-password?token=${token}`;
        const html = this.loadTemplate('password-reset', { resetLink });

        const mailOptions = {
            from: 'Finance-app-backend service',
            to,
            subject: 'Password Reset Request',
            html,
        };

        try {
            await this.transporter.sendMail(mailOptions);
        } catch (error) {
            throw new InternalServerErrorException({
                message: 'Failed to send email',
                cause: error instanceof Error ? error : undefined,
            });
        }
    }

    async sendEmailVerificationCode(to: string, code: string): Promise<void> {
        const html = this.loadTemplate('verification-code', { code });

        const mailOptions = {
            from: 'Finance-app-backend service',
            to,
            subject: 'Email Verification Code',
            html,
        };

        try {
            await this.transporter.sendMail(mailOptions);
        } catch (error) {
            throw new InternalServerErrorException({
                message: 'Failed to send email',
                cause: error instanceof Error ? error : undefined,
            });
        }
    }
}
