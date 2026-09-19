import { describe, it, expect } from 'vitest';
import { Bodyguard, decodeFormComponent } from '../src/index.js';
import { ERRORS } from '../src/lib.js';
import { createUrlencodedRequest, createFormDataRequest } from './util.js';

function createRawUrlencodedRequest(body: string): Request {
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body
    });
}

describe('Browser wire format tests', () => {
    // One form, posted both ways a browser can post it
    const pairs: [string, string][] = [
        ["q", "hello world"],
        ["math", "1+1=2"],
        ["discount", "100%"],
        ["tags[]", "x"],
        ["tags[]", "y"],
        ["items[0].name", "Äiti ☃"],
        ["bio", "line one\r\nline two\r\n"],
    ];

    const expected = {
        q: "hello world",
        math: "1+1=2",
        discount: "100%",
        tags: ["x", "y"],
        items: [{ name: "Äiti ☃" }],
        bio: "line one\r\nline two\r\n",
    };

    it('parses a browser-serialized body (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createUrlencodedRequest(pairs))).toEqual(expected);
    });

    it('parses a browser-serialized body (form with multipart)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createFormDataRequest(pairs))).toEqual(expected);
    });

    it('decodes percent-encoded names (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        const req = createUrlencodedRequest([["tags[]", "x"], ["tags[]", "y"], ["items[0].name", "first"]]);

        // A browser does not send the brackets as they are
        expect(await req.clone().text()).toBe("tags%5B%5D=x&tags%5B%5D=y&items%5B0%5D.name=first");
        expect(await bodyguard.form(req)).toEqual({ tags: ["x", "y"], items: [{ name: "first" }] });
    });

    it('keeps a literal plus sign when pluses are converted (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        const req = createUrlencodedRequest([["math", "1+1=2"], ["q", "hello world"]]);

        expect(await req.clone().text()).toBe("math=1%2B1%3D2&q=hello+world");
        expect(await bodyguard.form(req)).toEqual({ math: "1+1=2", q: "hello world" });
    });

    it('never converts pluses in multipart (form with multipart)', async () => {
        const bodyguard = new Bodyguard();
        const result = await bodyguard.form(createFormDataRequest([["math", "1+1"]]), undefined, { convertPluses: true });
        expect(result).toEqual({ math: "1+1" });
    });

    it('uses convertPluses from the instance unless the call overrides it (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard({ convertPluses: false });
        expect(await bodyguard.form(createUrlencodedRequest([["q", "a b"]]))).toEqual({ q: "a+b" });
        expect(await bodyguard.form(createUrlencodedRequest([["q", "a b"]]), undefined, { convertPluses: true })).toEqual({ q: "a b" });
    });

    it('keeps a percent sign that is not an escape (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createRawUrlencodedRequest("a=100%&b=%zz&c=%4"))).toEqual({ a: "100%", b: "%zz", c: "%4" });
    });

    it('replaces bytes that are not UTF-8 (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createRawUrlencodedRequest("a=%ff&b=%E2%82"))).toEqual({ a: "�", b: "�" });
    });

    it('accepts a field named in any script (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createUrlencodedRequest([["ключ", "значение"]]))).toEqual({ "ключ": "значение" });
    });

    it('measures maxKeyLength on the decoded name (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard({ maxKeyLength: 4 });

        const fits = await bodyguard.softForm(createRawUrlencodedRequest("a%5B0%5D=1"));
        expect(fits.success).toBe(true);

        const tooLong = await bodyguard.softForm(createRawUrlencodedRequest("ab%5B0%5D=1"));
        expect(tooLong.success).toBe(false);
        if (!tooLong.success) expect(tooLong.error.message).toBe(ERRORS.KEY_TOO_LONG);
    });

    it('counts every named pair, the last one included (softForm with urlencoded)', async () => {
        const bodyguard = new Bodyguard({ maxKeys: 2 });

        // Empty pairs and pairs without a name are no keys
        const fits = await bodyguard.softForm(createRawUrlencodedRequest("a=1&&&&=x&b=2"));
        expect(fits.success).toBe(true);
        if (fits.success) expect(fits.value).toEqual({ a: "1", b: "2" });

        const tooMany = await bodyguard.softForm(createRawUrlencodedRequest("a=1&b=2&c=3"));
        expect(tooMany.success).toBe(false);
        if (!tooMany.success) expect(tooMany.error.message).toBe(ERRORS.TOO_MANY_KEYS);
    });
});

describe('Content type tests', () => {
    const multipartBody = (boundary: string) => [`--${boundary}`, 'Content-Disposition: form-data; name="a"', '', '1', `--${boundary}--`, ''].join('\r\n');

    function createRequest(contentType: string, body: string): Request {
        return new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": contentType
            },
            body
        });
    }

    it('accepts the content types fetch() writes itself (pat)', async () => {
        const bodyguard = new Bodyguard();

        // What fetch() sets for a URLSearchParams body and for a string body
        expect(await bodyguard.pat(createRequest("application/x-www-form-urlencoded;charset=UTF-8", "a=1"))).toEqual({ a: "1" });
        expect(await bodyguard.pat(createRequest("text/plain;charset=UTF-8", "hello"))).toBe("hello");
    });

    it('reads a media type in any case, whatever its parameters (softPat)', async () => {
        const bodyguard = new Bodyguard();

        const result = await bodyguard.softPat(createRequest("Application/JSON; charset=utf-8", '{"a": 1}'));
        expect(result.success).toBe(true);
        if (result.success) expect(result.value).toEqual({ a: 1 });
    });

    it('reads the boundary among other parameters (form with multipart)', async () => {
        const bodyguard = new Bodyguard();

        expect(await bodyguard.form(createRequest('multipart/form-data; boundary="abc"', multipartBody("abc")))).toEqual({ a: "1" });
        expect(await bodyguard.form(createRequest("multipart/form-data; boundary=abc; charset=utf-8", multipartBody("abc")))).toEqual({ a: "1" });
        expect(await bodyguard.form(createRequest("multipart/form-data; Boundary=abc", multipartBody("abc")))).toEqual({ a: "1" });
    });

    it('keeps the first of a boundary given twice (form with multipart)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createRequest("multipart/form-data; boundary=abc; boundary=xyz", multipartBody("abc")))).toEqual({ a: "1" });
    });
});

describe('decodeFormComponent tests', () => {
    it('decodes a string or its bytes alike', () => {
        expect(decodeFormComponent("a+b%41")).toBe("a bA");
        expect(decodeFormComponent(new TextEncoder().encode("a+b%41"))).toBe("a bA");
        expect(decodeFormComponent("%C3%84iti+%E2%98%83")).toBe("Äiti ☃");
    });

    it('leaves pluses as they are when told to', () => {
        expect(decodeFormComponent("a+b%2B", false)).toBe("a+b+");
    });

    it('reads a plus sign before the percent escapes', () => {
        expect(decodeFormComponent("1%2B1+2")).toBe("1+1 2");
    });

    it('never throws on malformed input', () => {
        expect(decodeFormComponent("%")).toBe("%");
        expect(decodeFormComponent("%4")).toBe("%4");
        expect(decodeFormComponent("%%41")).toBe("%A");
        expect(decodeFormComponent("%ff")).toBe("�");
    });

    it('keeps a byte order mark', () => {
        expect(decodeFormComponent("%EF%BB%BFa")).toBe("﻿a");
    });
});
