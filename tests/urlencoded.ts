import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';

describe('URLEncoded tests', () => {
    it('uses a validator to parse a value (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo bar"
        });

        type FormData = { a: number; [key: string]: any };
        const validator = (value: unknown): FormData => {
            const typedValue = value as any;
            if (typedValue.a === 1) {
                return typedValue as FormData;
            }
            else throw new Error('invalid value');
        };

        const result = await bodyguard.softForm(req, validator, {
            castNumbers: true
        });

        expect(result.success).toBe(true);

        if (result.success) {
            const data = result.value as FormData;
            expect(data.a).toBe(1);
        }
    });

    it('converts pluses to spaces (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo+bar"
        });

        const result = await bodyguard.softForm(req, undefined, {
            castNumbers: true,
            convertPluses: true,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            const data = result.value as any;
            expect(data.a).toBe(1);
            expect(data.b).toBe(2);
            expect(data.c.d).toBe(3);
            expect(data.e).toBe('foo');
            expect(data.f.g).toBe(4);
            expect(data.f.bgfd).toBe(5);
            expect(data.f.h).toBe('foo bar');
        }
    });

    it('leaves pluses as is (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo+bar"
        });

        const result = await bodyguard.softForm(req, undefined, {
            castNumbers: true,
            convertPluses: false,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            const data = result.value as any;
            expect(data.a).toBe(1);
            expect(data.b).toBe(2);
            expect(data.c.d).toBe(3);
            expect(data.e).toBe('foo');
            expect(data.f.g).toBe(4);
            expect(data.f.bgfd).toBe(5);
            expect(data.f.h).toBe('foo+bar');
        }
    });

    it('passes complex input (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb"
        });

        const result = await bodyguard.softForm(req, undefined, {
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

    it('fails on prototype pollution (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "__proto__=a"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });

    it('fails on too many input bytes (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard({
            maxSize: 10,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.MAX_SIZE_EXCEEDED);
        }
    });

    it('fails on too many input keys (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard({
            maxKeys: 5,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_MANY_KEYS);
        }
    });

    it('fails on too long keys (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard({
            maxKeyLength: 3,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "abcd=1"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.KEY_TOO_LONG);
        }
    });

    it('fails on invalid segment (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "[a]=1"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toContain("Invalid segment");
        }
    });

    it('fails on too deep input (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard({
            maxDepth: 1,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a.b=1"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_DEEP);
        }
    });
});