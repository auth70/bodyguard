import * as assert from 'uvu/assert';

import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';
import { ERRORS } from '../src/lib.js';


test('it parses text (softText)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "text/plain"
        },
        body: "hello world"
    });

    const result = await bodyguard.softText(req);

    assert.equal(result.success, true);

    if(result.success) {
        assert.equal(result.value, "hello world");
    }

});

test('it parses text (text)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "text/plain"
        },
        body: "hello world"
    });

    const result = await bodyguard.text(req);
    assert.equal(result, "hello world");

});

test('it parses text with a validator (softText)', async () => {

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

    assert.equal(result.success, true);

    if(result.success) {
        assert.equal(result.value, "hello world");
    }
    
});

test('it fails with a validator (softText)', async () => {

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

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error, ERRORS.INVALID_INPUT);
    }
    
});

test.run();
