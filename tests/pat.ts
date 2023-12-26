import * as assert from 'uvu/assert';
import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';
import { ERRORS } from '../src/lib.js';
import { createMultipartRequest } from './util.js';

test('it auto negotiates content (softPat with application/json)', async () => {

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

    const result = await bodyguard.softPat(req, (value) => {
        if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(ERRORS.INVALID_INPUT);
        if(value.a === 1) {
            return value;
        }
        else throw new Error('invalid value');
    });

    assert.equal(result.success, true);

    if(result.success) {
        assert.equal(result.value, {
            a: 1
        });
    }

});

test('it auto negotiates content (pat with text/plain)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "text/plain"
        },
        body: "hello world"
    });

    const result = await bodyguard.pat(req);
    assert.equal(result, "hello world");

});

test('it auto negotiates content (softPat with application/x-www-form-urlencoded)', async () => {

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

    assert.equal(result.success, true);

    if(result.success) {
        const data = result.value as any;
        assert.equal(data.a, 1);
        assert.equal(data.b, 2);
        assert.equal(data.c.d, 3);
        assert.equal(data.c.e, 'bb');
        assert.equal(data.e, 'foo');
        assert.equal(data.f.g, 4);
        assert.equal(data.f.bgfd, 5);
        assert.equal(data.f.h[0], 'foo bar');
    }

});


test('it auto negotiates content (softPat with multipart form)', async () => {

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

    assert.equal(result.success, true);

    if(result.success) {
        assert.equal(result.value.a, 1);
        assert.equal(result.value.b, true);
        assert.equal(result.value.c, false);
    }

});

test.run();
