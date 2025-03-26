import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';
import { createMultipartRequest } from './util.js';

describe('patting down tests', () => {
    it('auto negotiates content (softPat with application/json)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify({
                a: 1,
            })
        });

        type TestObj = { a: number };
        const validator = (value: unknown): TestObj => {
            const typedValue = value as any;
            if (!typedValue || typeof typedValue !== 'object' || Array.isArray(typedValue)) 
                throw new Error(ERRORS.INVALID_INPUT);
            if (typedValue.a === 1) {
                return typedValue as TestObj;
            }
            else throw new Error('invalid value');
        };

        const result = await bodyguard.softPat(req, validator);

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.value).toEqual({ a: 1 });
        }
    });

    it('auto negotiates content (pat with text/plain)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const result = await bodyguard.pat(req);
        expect(result).toBe("hello world");
    });

    it('auto negotiates content (softPat with application/x-www-form-urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb"
        });

        const result = await bodyguard.softPat(req, undefined, {
            castNumbers: true,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            const data = result.value as any;
            expect(data.a).toBe(1);
            expect(data.b).toBe(2);
            expect(data.c.d).toBe(3);
            expect(data.c.e).toBe('bb');
            expect(data.e).toBe('foo');
            expect(data.f.g).toBe(4);
            expect(data.f.bgfd).toBe(5);
            expect(data.f.h[0]).toBe('foo bar');
        }
    });

    it('auto negotiates content (softPat with multipart form)', async () => {
        const bodyguard = new Bodyguard({
            castBooleans: true,
            castNumbers: true
        });

        const [req, boundary] = createMultipartRequest({
            a: "1",
            b: "true",
            c: "false",
        });

        const result = await bodyguard.softPat(req);

        expect(result.success).toBe(true);

        if (result.success) {
            type FormData = { a: number; b: boolean; c: boolean };
            const value = result.value as FormData;
            expect(value.a).toBe(1);
            expect(value.b).toBe(true);
            expect(value.c).toBe(false);
        }
    });

    it('throws on invalid content type (softPat)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/xml"
            },
            body: "<a>1</a>"
        });

        const result = await bodyguard.softPat(req);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_CONTENT_TYPE);
        }
    });

    it('throws on no content type (softPat)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            body: "<a>1</a>",
            headers: {
                "content-type": ""
            }
        });

        const result = await bodyguard.softPat(req);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.NO_CONTENT_TYPE);
        }
    });

    it('throws on no content type (pat)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            body: "<a>1</a>",
            headers: {
                "content-type": ""
            }
        });

        await expect(bodyguard.pat(req)).rejects.toThrow(ERRORS.NO_CONTENT_TYPE);
    });
});
