import nodemailer, { SendMailOptions } from 'nodemailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: 'araceli.christiansen@ethereal.email',
                pass: 'HdMFxQTkbgXteVwSJX',
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
}
