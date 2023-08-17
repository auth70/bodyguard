import * as assert from 'uvu/assert';

import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';
import { ERRORS } from '../src/lib.js';

test('it throws on prototype pollution (softJson)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: "{\"__proto__\": \"a\"}"
    });

    const result = await bodyguard.softJson(req, { a: 1, b: 2 });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.INVALID_INPUT);
    }

});

test('it fails with no body validator (softJson)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
    });

    const result = await bodyguard.softJson(req, { a: 1, c: 2 });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.BODY_NOT_AVAILABLE);
    }

});


test('it passes json with validator (softJson)', async () => {

    const bodyguard = new Bodyguard({
        validator: (value, schema) => {
            if(value?.a !== schema?.a) throw new Error('a does not match');
            if(value?.b !== schema?.b) throw new Error('b does not match');
        }
    });

    const obj = {
        a: 1,
        b: 2
    };

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(obj)
    });

    const result = await bodyguard.softJson(req, { a: 1, b: 2 });

    assert.equal(result.success, true);

    if(result.success) {

        assert.equal(result.value.a, obj.a);
        assert.equal(result.value.b, obj.b);
        
    }

});

test('it fails json with validator (softJson)', async () => {

    const bodyguard = new Bodyguard({
        validator: (value, schema) => {
            if(value?.a !== schema?.a) throw new Error('a does not match');
            if(value?.b !== schema?.b) throw new Error('b does not match');
        }
    });

    const obj = {
        a: 1,
        b: 2
    };

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(obj)
    });

    const result = await bodyguard.softJson(req, { a: 1, c: 2 });

    assert.equal(result.success, false);

});

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
        assert.equal(result.error, ERRORS.INVALID_INPUT);
    }

});

test('it fails on too long key (softJson)', async () => {

    const bodyguard = new Bodyguard({
        maxKeyLength: 2,
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
        assert.equal(result.error, ERRORS.KEY_TOO_LONG);
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


test.run();