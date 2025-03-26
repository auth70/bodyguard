import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';

describe('Text tests', () => {
    it('parses text (softText)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const result = await bodyguard.softText(req);

        expect(result.success).toBe(true);

        if(result.success) {
            expect(result.value).toBe("hello world");
        }
    });

    it('parses text (text)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const result = await bodyguard.text(req);
        expect(result).toBe("hello world");
    });

    it('parses text with a validator (softText)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const result = await bodyguard.softText(req, (value) => {
            if(value === "hello world") {
                return value;
            }
            else throw new Error('invalid value');
        });

        expect(result.success).toBe(true);

        if(result.success) {
            expect(result.value).toBe("hello world");
        }
    });

    it('fails with a validator (softText)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const result = await bodyguard.softText(req, (value) => {
            if(value === "hi world") {
                return value;
            }
            else throw new Error(ERRORS.INVALID_INPUT);
        });

        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });
});
