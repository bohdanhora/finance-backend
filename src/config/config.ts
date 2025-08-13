export default () => ({
    jwt: {
        secret: process.env.JWT_SECRET,
        accessTokenTtl: process.env.JWT_ACCESS_TOKEN_TTL || '1h',
        refreshTokenTtlDays: parseInt(
            process.env.JWT_REFRESH_TOKEN_TTL_DAYS || '3',
            10,
        ),
    },
    database: {
        connectionString: process.env.MONGO_URL,
    },
    nodemailer: {
        host: process.env.NODEMAILER_HOST,
        port: process.env.NODEMAILER_PORT,
        user: process.env.NODEMAILER_USER,
        pass: process.env.NODEMAILER_PASS,
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL,
    },
});
