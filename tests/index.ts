import * as assert from 'uvu/assert';

import { Bodyguard } from '../src/index.js';
import { test } from 'uvu';
import { ERRORS } from '../src/lib.js';

test('it fails with no content type (softForm)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "",
        },
        body: JSON.stringify({ a: 1 })
    });

    const result = await bodyguard.softForm(req, { a: 1 });

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error.message, (ERRORS.NO_CONTENT_TYPE));
    }

});

test('it fails with no body (softForm)', async () => {

    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
    });

    const result = await bodyguard.softForm(req);

    assert.equal(result.success, false);

    if(!result.success) {
        assert.equal(result.error.message, (ERRORS.BODY_NOT_AVAILABLE));
    }

});

test('it fails with no body (text)', async () => {
    
    const bodyguard = new Bodyguard();

    const req = new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
    });

    try {
        const result = await bodyguard.text(req);
    } catch(err) {
        assert.equal(err.message, (ERRORS.BODY_NOT_AVAILABLE));
    }

});

test.run();