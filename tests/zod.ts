import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Bodyguard } from '../src/index.js';
import { JSONLike, BodyguardValidator } from '../src/lib.js';

describe('Zod integration tests', () => {
    it('uses a validator to parse a value (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo bar"
        });

        const schema = z.object({
            a: z.number(),
            b: z.number(),
            c: z.object({
                d: z.number()
            }),
            e: z.string(),
            f: z.object({
                g: z.number(),
                bgfd: z.number(),
                h: z.string()
            })
        });

        type SchemaType = z.infer<typeof schema>;

        const result = await bodyguard.softForm<typeof schema.parse, { terror: string }>(req, schema.parse, {
            castNumbers: true
        });

        expect(result.success).toBe(true);

        if (result.success) {
            const data = result.value as SchemaType;
            expect(data.a).toBe(1);
        } else {
            // result.error?.terror
        }

        const req2 = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo bar"
        });

        const result2 = await bodyguard.softForm(req2, schema.parse, {
            castNumbers: true
        });

        expect(result2.success).toBe(true);

        if (result2.success) {
            const data = result2.value as SchemaType;
            expect(data.b).toBe(2);
        } else {
            // result.error?.terror
        }
    });
});