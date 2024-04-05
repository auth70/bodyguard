import * as assert from 'uvu/assert';
import { z } from 'zod';
import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';

test('zod: it uses a validator to parse a value (softForm with urlencoded)', async () => {
    
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

    const result = await bodyguard.softForm<typeof schema.parse, { terror: string }>(req, schema.parse, {
        castNumbers: true
    });

    assert.equal(result.success, true);

    if(result.success) {
        const data = result.value;
        assert.equal(data.a, 1);
    } else {
        // result.error?.terror
    }
});

test.run();