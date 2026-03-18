import { Prisma, User } from "@prisma/client";
import { hashSync, genSaltSync, compareSync, compare } from 'bcrypt';
import Service from "./Service";

import { JwtPayload, Secret, sign, SignOptions, verify } from "jsonwebtoken"
import config from "@/config";


export default class AuthService extends Service {

    public hash(data: string | Buffer): string {
        return hashSync(data, genSaltSync(10));
    }

    public compareHash(data: string, hash: string): Promise<boolean> {
        return compare(data, hash);
    }


    public createToken(data: object | Buffer, options?: SignOptions): string {
        return sign(
            { ...data },
            config.jwt.secret,
            {
                algorithm: "HS256",
                audience: config.jwt.audience,
                issuer: config.jwt.issuer,
                expiresIn: config.jwt.expiresIn,
                ...options
            }
        )
    }

    public verify(token: string): JwtPayload {
        const payload = verify(
            token,
            config.jwt.secret,
            {
                algorithms: ["HS256"],
                audience: config.jwt.audience,
                issuer: config.jwt.issuer
            }
        );

        if (typeof payload === 'string' || !payload) {
            throw new Error('Invalid token payload');
        }

        return payload;
    }
}