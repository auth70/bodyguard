import * as assert from 'uvu/assert';

import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';
import { ERRORS } from '../src/lib.js';
import { createMultipartRequest } from './util.js';

test('it passes nested json with arrays (softJson)', async () => {

    const bodyguard = new Bodyguard();

    const obj = {
        rootA: 1,
        rootB: {
            depth1A: {
                depth2A: {
                    B: [1, 2, 3],
                    C: 'foo'
                }
            }
        }
    };

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(obj)
    });

    const result = await bodyguard.softJson(req, obj);

    assert.equal(result.success, true);

    if(result.success) {

        assert.equal(result.value.rootA, obj.rootA);
        assert.equal(result.value.rootB.depth1A.depth2A.B[0], obj.rootB.depth1A.depth2A.B[0]);
        assert.equal(result.value.rootB.depth1A.depth2A.B[1], obj.rootB.depth1A.depth2A.B[1]);
        assert.equal(result.value.rootB.depth1A.depth2A.B[2], obj.rootB.depth1A.depth2A.B[2]);
        assert.equal(result.value.rootB.depth1A.depth2A.C, obj.rootB.depth1A.depth2A.C);
        
    }

});

test('it fails on too many input bytes (softJson)', async () => {

    const bodyguard = new Bodyguard({
        maxSize: 10,
    });

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: '{"foo": "bar"}'
    });

    const result = await bodyguard.softJson(req);
    
    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.MAX_SIZE_EXCEEDED);
    }

});


test('it fails on invalid json (softJson)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: '{foo: "bar"}'
    });

    const result = await bodyguard.softJson(req);
    
    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.INVALID_JSON);
    }

});

test('it fails on too many input keys (softJson)', async () => {

    const bodyguard = new Bodyguard({
        maxKeys: 3,
    });

    const obj = {
        rootA: 1,
        rootB: {
            depth1A: "{\"nested\": {\"foo\":\"bar\"}\"}",
            depth1B: {
                depth2A: {
                    depth3A: {
                        depth4A: {
                            depth5A: {
                                'foo': 'bar'
                            }
                        }
                    }
                }
            }
        },
        e: [1, 2, 3]
    };
    
    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(obj)
    });

    const result = await bodyguard.softJson(req, {
        a: 1,
        b: 2
    });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.TOO_MANY_KEYS);
    }

});

test('it fails on too deep input (JSON)', async () => {

    const bodyguard = new Bodyguard({
        maxDepth: 1,
    });

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({
            a: {
                b: 1
            }
        })
    });

    const result = await bodyguard.softJson(req, {
        a: {
            b: 1
        }
    });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.TOO_DEEP);
    }

});

test('it passes complex input (softForm with urlencoded)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb"
    });

    const result = await bodyguard.softForm(req);

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

test('it fails on too many input bytes (softForm with url params)', async () => {

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

    const result = await bodyguard.softForm(req, {
        a: 1,
        b: 2
    });


    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.MAX_SIZE_EXCEEDED);
    }

});

test('it fails on too many input keys (softForm with url params)', async () => {

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

    const result = await bodyguard.softForm(req, {
        a: 1,
        b: 2
    });


    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.TOO_MANY_KEYS);
    }

});

test('it fails on too deep input (softForm with urlencoded)', async () => {

    const bodyguard = new Bodyguard({
        maxDepth: 1,
    });

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h[]=foo%20bar&c.e=bb"
    });

    const result = await bodyguard.softForm(req, {
        a: {
            b: 1
        }
    });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.TOO_DEEP);
    }

});

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
        }
    };

    const [req, boundary] = createMultipartRequest(reqData);

    const result = await bodyguard.softForm(req, reqData);

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

    const result = await bodyguard.softForm(req, {
        a: 1,
        b: 2
    });

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

    const result = await bodyguard.softForm(req, {
        a: 1,
        b: 2
    });

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

test.run();