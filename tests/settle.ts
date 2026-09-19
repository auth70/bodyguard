import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS } from '../src/lib.js';

function createJsonRequest(body: string): Request {
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body
    });
}

/** A body that hands over its chunks and then fails, as when the client goes away. */
function createFailingRequest(contentType: string, ...chunks: string[]): Request {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            const chunk = chunks.shift();
            if (chunk !== undefined) controller.enqueue(encoder.encode(chunk));
            else controller.error(new Error("socket hang up"));
        }
    });

    return new Request("http://localhost", ({
        method: "POST",
        headers: {
            "content-type": contentType
        },
        body: stream,
        duplex: "half"
    } as any));
}

/** A body that hands over one chunk per read, and records whether it was told to stop. */
function createRecordingRequest(contentType: string, chunks: string[]): [Request, { cancelled: boolean }] {
    const encoder = new TextEncoder();
    const source = { cancelled: false };
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            const chunk = chunks.shift();
            if (chunk !== undefined) controller.enqueue(encoder.encode(chunk));
            else controller.close();
        },
        cancel() {
            source.cancelled = true;
        }
    });

    return [new Request("http://localhost", ({
        method: "POST",
        headers: {
            "content-type": contentType
        },
        body: stream,
        duplex: "half"
    } as any)), source];
}

const multipartField = (name: string) => `--XX\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n1\r\n`;

const failingRequests = {
    json: () => createFailingRequest("application/json", '{"a":'),
    text: () => createFailingRequest("text/plain", "abc"),
    urlencoded: () => createFailingRequest("application/x-www-form-urlencoded", "a=1&b"),
    multipart: () => createFailingRequest("multipart/form-data; boundary=XX", '--XX\r\nContent-Disposition: form-data; name="a"\r\n\r\n1'),
};

describe('Settling tests', () => {
    it('passes values that have no closing character (json)', async () => {
        const bodyguard = new Bodyguard();

        expect(await bodyguard.json(createJsonRequest("12"))).toBe(12);
        expect(await bodyguard.json(createJsonRequest("-1.5e3"))).toBe(-1500);
        expect(await bodyguard.json(createJsonRequest("null"))).toBe(null);
        expect(await bodyguard.json(createJsonRequest('{"a": 1}\n'))).toEqual({ a: 1 });
    });

    it('fails on a document that stops half-way (softJson)', async () => {
        const bodyguard = new Bodyguard();

        for (const body of ['{"a": 1', '[1, 2', '"abc', 'tru', '   ']) {
            const result = await bodyguard.softJson(createJsonRequest(body));
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });

    it('fails on a body without a single byte (softJson)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", ({
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: new ReadableStream({ start(controller) { controller.close(); } }),
            duplex: "half"
        } as any));

        const result = await bodyguard.softJson(req);
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
    });

    it('fails on data after the document (softJson)', async () => {
        const bodyguard = new Bodyguard();

        for (const body of ['{"a": 1} x', '{"a": 1} {"b": 2}']) {
            const result = await bodyguard.softJson(createJsonRequest(body));
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });

    it('returns the error of a stream that fails mid-body (softJson, softText, softForm)', async () => {
        const bodyguard = new Bodyguard();

        const results = [
            await bodyguard.softJson(failingRequests.json()),
            await bodyguard.softText(failingRequests.text()),
            await bodyguard.softForm(failingRequests.urlencoded()),
            await bodyguard.softForm(failingRequests.multipart()),
        ];

        for (const result of results) {
            expect(result.success).toBe(false);
            if (!result.success) expect((result.error as Error).message).toBe("socket hang up");
        }
    });

    it('throws the error of a stream that fails mid-body (json, text, form)', async () => {
        const bodyguard = new Bodyguard();

        await expect(bodyguard.json(failingRequests.json())).rejects.toThrow("socket hang up");
        await expect(bodyguard.text(failingRequests.text())).rejects.toThrow("socket hang up");
        await expect(bodyguard.form(failingRequests.urlencoded())).rejects.toThrow("socket hang up");
        await expect(bodyguard.form(failingRequests.multipart())).rejects.toThrow("socket hang up");
    });

    it('stops reading a body it has refused (softJson, softForm)', async () => {
        const bodyguard = new Bodyguard({ maxKeys: 1 });

        // Twenty keys, one chunk each: the second key is refused, long before the last chunk is asked for
        const names = Array.from({ length: 20 }, (_, i) => `k${i}`);
        const bodies: [string, string[]][] = [
            ["application/json", ["{", ...names.map((name) => `"${name}":1,`), '"last":1}']],
            ["application/x-www-form-urlencoded", names.map((name) => `${name}=1&`)],
            ["multipart/form-data; boundary=XX", [...names.map(multipartField), "--XX--\r\n"]],
        ];

        for (const [contentType, chunks] of bodies) {
            const [req, source] = createRecordingRequest(contentType, chunks);
            const result = await bodyguard.softPat(req);

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.message).toBe(ERRORS.TOO_MANY_KEYS);
            expect(source.cancelled).toBe(true);
            // The refusal came before the body was read to its end
            expect(chunks.length).toBeGreaterThan(0);
        }
    });

    it('keeps a character that is split between two chunks (text)', async () => {
        const bodyguard = new Bodyguard();
        const bytes = new TextEncoder().encode("päivää");

        const req = new Request("http://localhost", ({
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: new ReadableStream({
                start(controller) {
                    // The first `ä` is two bytes, and the cut falls between them
                    controller.enqueue(bytes.slice(0, 2));
                    controller.enqueue(bytes.slice(2));
                    controller.close();
                }
            }),
            duplex: "half"
        } as any));

        expect(await bodyguard.text(req)).toBe("päivää");
    });
});
