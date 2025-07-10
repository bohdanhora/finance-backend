export default () => ({
    jwt: {
        secret: process.env.JWT_SECRET,
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
});
