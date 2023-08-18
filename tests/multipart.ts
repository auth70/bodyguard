import * as assert from 'uvu/assert';

import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';
import { ERRORS } from '../src/lib.js';
import { createMultipartRequest } from './util.js';

test('it passes nested multipart form with arrays (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard();

    const reqData = {
        a: 1,
        b: '',
        blbl: "foo",
        c: {
            d: 3,
            e: "foo",
            f: {
                bool1: 'true',
                bool2: 'false',
                bgfd: {
                    foo: 'bar'
                }
            },
            arr: ['asdf', 123],
            "h.j.k.l": "foo",
            "array1[].re": "foobar",
            "array2[].foo.bar[]": "baz1",
            "array2[].foo.bar[1].boo": "baz2",
            "array2[4].foo.bar[]": "baz3",
            "array2[4].foo.bar[3]": "baz4",
            "array2[4].foo.bax[1]": "baxx",
        }
    };

    const [req, boundary] = createMultipartRequest(reqData);

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, true);
    
    if(result.success) {
        assert.equal(result.value.a, reqData.a);
        assert.equal(result.value.b, reqData.b);
        assert.equal(result.value.blbl, reqData.blbl);
        assert.equal(result.value.c.d, reqData.c.d);
        assert.equal(result.value.c.e, reqData.c.e);
        assert.equal(result.value.c.f.bool1, 'true');
        assert.equal(result.value.c.f.bool2, 'false');
        assert.equal(result.value.c.f.bgfd.foo, reqData.c.f.bgfd.foo);
        assert.equal(result.value.c.arr[0], reqData.c.arr[0]);
        assert.equal(result.value.c.arr[1], reqData.c.arr[1]);
        assert.equal((result.value.c as any).h.j.k.l, "foo");
        assert.equal((result.value.c as any).array1[0].re, "foobar");
        assert.equal((result.value.c as any).array2[0].foo.bar[0], "baz1");
        assert.equal((result.value.c as any).array2[0].foo.bar[1].boo, "baz2");
        assert.equal((result.value.c as any).array2[1], undefined);
        assert.equal((result.value.c as any).array2[2], undefined);
        assert.equal((result.value.c as any).array2[3], undefined);
        assert.equal((result.value.c as any).array2[4].foo.bar[0], "baz3");
        assert.equal((result.value.c as any).array2[4].foo.bar[1], undefined);
        assert.equal((result.value.c as any).array2[4].foo.bar[2], undefined);
        assert.equal((result.value.c as any).array2[4].foo.bar[3], "baz4");
        assert.equal((result.value.c as any).array2[4].foo.bax[0], undefined);
        assert.equal((result.value.c as any).array2[4].foo.bax[1], "baxx");
    }

});

test('it casts numbers and booleans (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        castBooleans: true,
        castNumbers: true
    });

    const [req, boundary] = createMultipartRequest({
        a: "1",
        b: "true",
        c: "false",
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, true);

    if(result.success) {
        assert.equal(result.value.a, 1);
        assert.equal(result.value.b, true);
        assert.equal(result.value.c, false);
    }

});

test('it fails on prototype pollution (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard();

    const [req, boundary] = createMultipartRequest({
        a: 1,
    }, {
        prototypePollution: true
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.INVALID_INPUT);
    }

});

test('it fails on too long keys (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        maxKeyLength: 2,
    });

    const [req, boundary] = createMultipartRequest({
        abc: 1,
    });

    const result = await bodyguard.softForm(req, {
        abc: 1,
    });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.KEY_TOO_LONG);
    }

});

test('it fails on too many input bytes (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        maxSize: 10,
    });

    const [req, boundary] = createMultipartRequest({
        a: 1,
        b: 2,
        c: {
            d: 3,
            e: "foo",
            f: {
                g: 4,
                bgfd: 5
            }
        }
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.MAX_SIZE_EXCEEDED);
    }

});

test('it fails on too many input keys (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        maxKeys: 1,
    });

    const [req, boundary] = createMultipartRequest({
        a: 1,
        b: 2,
        c: {
            d: 3,
            e: "foo",
            f: {
                g: 4,
                bgfd: 5
            }
        }
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.TOO_MANY_KEYS);
    }

});


test('it fails on too deep input (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        maxDepth: 1,
    });

    const [req, boundary] = createMultipartRequest({
        a: 1,
        b: 2,
        c: {
            d: 3,
            e: "foo",
            f: {
                g: 4,
                bgfd: 5
            }
        }
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.TOO_DEEP);
    }

});

test('it fails on broken boundary in header (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        maxKeys: 1,
    });

    const [req, boundary] = createMultipartRequest({
        a: 1,
        b: 2,
    }, {
        brokenBoundary: true
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.INVALID_CONTENT_TYPE);
    }

});

test('it fails on no boundary in header (softForm with multipart)', async () => {

    const bodyguard = new Bodyguard({
        maxKeys: 1,
    });

    const [req, boundary] = createMultipartRequest({
        a: 1,
        b: 2,
    }, {
        noBoundary: true
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.INVALID_CONTENT_TYPE);
    }

});

test.run();