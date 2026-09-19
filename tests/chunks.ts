import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { createUrlencodedRequest, createFormDataRequest, createChunkedRequest } from './util.js';

/**
 * A stream hands a body over in pieces of any size, and the result may not depend on where they were cut.
 * Each body is parsed in chunks of one byte, then two, up to the whole of it, and has to come out as
 * the value written down here every time.
 */
describe('Chunk boundary tests', () => {
    const pairs: [string, string][] = [["q", "hello wörld ☃"], ["tags[]", "x"], ["rows[0].name", "päivää"], ["math", "1+1"]];
    const expected = { q: "hello wörld ☃", tags: ["x"], rows: [{ name: "päivää" }], math: "1+1" };

    async function expectAtEverySize<T>(request: Request, parse: (request: Request) => Promise<T>, value: T) {
        const contentType = request.headers.get("content-type")!;
        const bytes = new Uint8Array(await request.arrayBuffer());

        for (let size = 1; size <= bytes.length; size++) {
            expect(await parse(createChunkedRequest(bytes, contentType, size))).toEqual(value);
        }
    }

    it('gives the same result at every chunk size (form with urlencoded)', async () => {
        const bodyguard = new Bodyguard();
        await expectAtEverySize(createUrlencodedRequest(pairs), (request) => bodyguard.form(request), expected);
    });

    it('gives the same result at every chunk size (form with multipart)', async () => {
        const bodyguard = new Bodyguard();
        const request = createFormDataRequest([...pairs, ["shot", new File(["päivää"], "фото.jpg")]]);

        await expectAtEverySize(request, async (request) => {
            const result = await bodyguard.form(request) as Record<string, any>;
            return { ...result, shot: [result.shot.name, await result.shot.text()] };
        }, { ...expected, shot: ["фото.jpg", "päivää"] });
    });

    it('gives the same result at every chunk size (json)', async () => {
        const bodyguard = new Bodyguard();
        const value = { q: "hello wörld ☃", rows: [{ name: "päivää", n: -1500 }], ok: true, none: null };

        const request = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(value)
        });

        await expectAtEverySize(request, (request) => bodyguard.json(request), value);
    });

    it('gives the same result at every chunk size (json with a bare number)', async () => {
        const bodyguard = new Bodyguard();

        const request = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: "-1234.5e2"
        });

        await expectAtEverySize(request, (request) => bodyguard.json(request), -123450);
    });

    it('gives the same result at every chunk size (text)', async () => {
        const bodyguard = new Bodyguard();

        const request = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello wörld ☃ päivää"
        });

        await expectAtEverySize(request, (request) => bodyguard.text(request), "hello wörld ☃ päivää");
    });
});
