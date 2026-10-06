import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    app.useBodyParser('json', { limit: '1mb' });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
        }),
    );

    app.enableCors({
        origin: [
            'https://finance-front-zeta.vercel.app',
            'http://localhost:3000',
        ],
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
    });

    await app.listen(process.env.PORT ?? 8000);
}
bootstrap().catch((err) => {
    console.error('Application failed to start:', err);
    process.exit(1);
});
