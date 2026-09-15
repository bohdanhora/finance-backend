import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export interface EncryptedSecret {
    cipher: string;
    iv: string;
    tag: string;
}

export const deriveEncryptionKey = (secret: string): Buffer =>
    createHash('sha256').update(secret, 'utf8').digest();

export const encryptSecret = (
    plainText: string,
    key: Buffer,
): EncryptedSecret => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
    ]);

    return {
        cipher: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
    };
};

export const decryptSecret = (secret: EncryptedSecret, key: Buffer): string => {
    const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(secret.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(secret.cipher, 'base64')),
        decipher.final(),
    ]).toString('utf8');
};
