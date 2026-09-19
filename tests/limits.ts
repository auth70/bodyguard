import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS } from '../src/lib.js';
import { createUrlencodedRequest, createFormDataRequest, createMultipartRequest } from './util.js';

function createJsonRequest(value: unknown): Request {
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(value)
    });
}

describe('Limit boundary tests', () => {
    const three: [string, string][] = [["a", "1"], ["b", "2"], ["c", "3"]];

    it('passes as many keys as maxKeys (softForm, softJson)', async () => {
        const bodyguard = new Bodyguard({ maxKeys: 3 });

        expect((await bodyguard.softForm(createUrlencodedRequest(three))).success).toBe(true);
        expect((await bodyguard.softForm(createFormDataRequest(three))).success).toBe(true);
        expect((await bodyguard.softJson(createJsonRequest({ a: "1", b: "2", c: "3" }))).success).toBe(true);
    });

    it('fails on one key more than maxKeys (softForm, softJson)', async () => {
        const bodyguard = new Bodyguard({ maxKeys: 2 });

        const results = [
            await bodyguard.softForm(createUrlencodedRequest(three)),
            await bodyguard.softForm(createFormDataRequest(three)),
            await bodyguard.softJson(createJsonRequest({ a: "1", b: "2", c: "3" })),
        ];

        for (const result of results) {
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.message).toBe(ERRORS.TOO_MANY_KEYS);
        }
    });

    it('does not count a part without a name (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ maxKeys: 2 });

        const body = [
            '--XX', 'Content-Disposition: form-data; name=""', '', 'x',
            '--XX', 'Content-Disposition: form-data; name=""', '', 'y',
            '--XX', 'Content-Disposition: form-data; name="a"', '', '1',
            '--XX', 'Content-Disposition: form-data; name="b"', '', '2',
            '--XX--', '',
        ].join('\r\n');

        const result = await bodyguard.softForm(new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "multipart/form-data; boundary=XX"
            },
            body
        }));

        expect(result.success).toBe(true);
        if (result.success) expect(result.value).toEqual({ a: "1", b: "2" });
    });

    it('passes as many files as maxFiles (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ maxFiles: 1 });

        const one = await bodyguard.softForm(createFormDataRequest([["a", new File(["x"], "a.txt")]]));
        expect(one.success).toBe(true);

        const two = await bodyguard.softForm(createFormDataRequest([["a", new File(["x"], "a.txt")], ["b", new File(["x"], "b.txt")]]));
        expect(two.success).toBe(false);
        if (!two.success) expect(two.error.message).toBe(ERRORS.TOO_MANY_FILES);
    });

    it('passes a form without files when no files are allowed (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ maxFiles: 0 });

        const fields = await bodyguard.softForm(createFormDataRequest([["a", "1"]]));
        expect(fields.success).toBe(true);

        const file = await bodyguard.softForm(createFormDataRequest([["a", new File(["x"], "a.txt")]]));
        expect(file.success).toBe(false);
        if (!file.success) expect(file.error.message).toBe(ERRORS.TOO_MANY_FILES);
    });

    it('measures depth the same in every parser (softForm, softJson)', async () => {
        // An object, a list, an object: three levels, however the value arrives
        const requests = [
            () => createUrlencodedRequest([["items[0].name", "x"]]),
            () => createFormDataRequest([["items[0].name", "x"]]),
            () => createJsonRequest({ items: [{ name: "x" }] }),
        ];

        for (const createRequest of requests) {
            const fits = await new Bodyguard({ maxDepth: 3 }).softPat(createRequest());
            expect(fits.success).toBe(true);

            const tooDeep = await new Bodyguard({ maxDepth: 2 }).softPat(createRequest());
            expect(tooDeep.success).toBe(false);
            if (!tooDeep.success) expect(tooDeep.error.message).toBe(ERRORS.TOO_DEEP);
        }
    });

    it('measures a list of plain values as two levels (softForm, softJson)', async () => {
        const requests = [
            () => createUrlencodedRequest([["tags[]", "x"]]),
            () => createFormDataRequest([["tags[]", "x"]]),
            () => createJsonRequest({ tags: ["x"] }),
        ];

        for (const createRequest of requests) {
            expect((await new Bodyguard({ maxDepth: 2 }).softPat(createRequest())).success).toBe(true);
            expect((await new Bodyguard({ maxDepth: 1 }).softPat(createRequest())).success).toBe(false);
        }
    });

    it('passes a flat form at maxDepth 1 (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ maxDepth: 1 });

        expect((await bodyguard.softForm(createFormDataRequest([["a", "1"]]))).success).toBe(true);

        const nested = await bodyguard.softForm(createFormDataRequest([["a.b", "1"]]));
        expect(nested.success).toBe(false);
        if (!nested.success) expect(nested.error.message).toBe(ERRORS.TOO_DEEP);
    });

    it('adds the depth of a nested part to the key that holds it (softForm with multipart)', async () => {
        // `a.b` holds a part named `c`: three levels
        const shallow = () => createMultipartRequest({ "a.b": { c: "v" } })[0];
        expect((await new Bodyguard({ maxDepth: 3 }).softForm(shallow())).success).toBe(true);

        const tooDeep = await new Bodyguard({ maxDepth: 2 }).softForm(shallow());
        expect(tooDeep.success).toBe(false);
        if (!tooDeep.success) expect(tooDeep.error.message).toBe(ERRORS.TOO_DEEP);

        // `a.b.c` holds a part named `d.e.f`: six levels
        const deep = () => createMultipartRequest({ "a.b.c": { "d.e.f": "v" } })[0];
        const result = await new Bodyguard({ maxDepth: 6 }).softForm(deep());
        expect(result.success).toBe(true);
        if (result.success) expect(result.value).toEqual({ a: { b: { c: { d: { e: { f: "v" } } } } } });
        expect((await new Bodyguard({ maxDepth: 5 }).softForm(deep())).success).toBe(false);
    });
});
