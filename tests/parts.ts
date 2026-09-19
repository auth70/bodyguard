import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS } from '../src/lib.js';
import { createFormDataRequest, createMultipartRequest } from './util.js';

/** A multipart request written by hand, for the parts a serializer will not write. */
function createRawMultipartRequest(parts: string[][]): Request {
    const body = [...parts.flatMap((part) => ['--XX', ...part]), '--XX--', ''].join('\r\n');
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "multipart/form-data; boundary=XX"
        },
        body
    });
}

// What a browser posts for a file input that was left empty
const emptyFileInput = (name: string) => [`Content-Disposition: form-data; name="${name}"; filename=""`, 'Content-Type: application/octet-stream', '', ''];

describe('Multipart part tests', () => {
    it('accepts a file named in any script (form with multipart)', async () => {
        const bodyguard = new Bodyguard();

        for (const filename of ["Näyttökuva.png", "фото.jpg", "スクリーンショット.png", "📷 holiday.png"]) {
            const result = await bodyguard.form(createFormDataRequest([["shot", new File(["x"], filename)]])) as { shot: File };
            expect(result.shot).toBeInstanceOf(File);
            expect(result.shot.name).toBe(filename);
        }
    });

    it('accepts a field named in any script (form with multipart)', async () => {
        const bodyguard = new Bodyguard();
        expect(await bodyguard.form(createFormDataRequest([["ключ", "значение"], ["päivä", "tänään"]]))).toEqual({ "ключ": "значение", "päivä": "tänään" });
    });

    it('holds only files against allowedContentTypes (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ allowedContentTypes: ['image/png'] });

        const allowed = await bodyguard.softForm(createFormDataRequest([
            ["title", "hello"],
            ["shot", new File(["x"], "a.png", { type: "image/png" })],
        ]));
        expect(allowed.success).toBe(true);

        const refused = await bodyguard.softForm(createFormDataRequest([
            ["title", "hello"],
            ["shot", new File(["x"], "a.gif", { type: "image/gif" })],
        ]));
        expect(refused.success).toBe(false);
        if (!refused.success) expect(refused.error.message).toBe(ERRORS.INVALID_CONTENT_TYPE);
    });

    it('compares the media type of a file, whatever its case and parameters (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ allowedContentTypes: ['image/png'] });

        const result = await bodyguard.softForm(createRawMultipartRequest([
            ['Content-Disposition: form-data; name="shot"; filename="a.png"', 'Content-Type: Image/PNG; note=x', '', 'x'],
        ]));
        expect(result.success).toBe(true);
    });

    it('returns a file input left empty as the empty File it is (form with multipart)', async () => {
        const bodyguard = new Bodyguard();

        const req = createRawMultipartRequest([emptyFileInput("cover")]);
        const platform = (await req.clone().formData()).get("cover") as File;
        const result = await bodyguard.form(req) as { cover: File };

        // The same value request.formData() gives
        expect(result.cover).toBeInstanceOf(File);
        expect([result.cover.name, result.cover.size, result.cover.type]).toEqual([platform.name, platform.size, platform.type]);
        expect([result.cover.name, result.cover.size]).toEqual(["", 0]);
    });

    it('does not take a file input left empty for a file (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({ maxFiles: 1, allowedContentTypes: ['text/plain'] });

        // One chosen file and two inputs left empty, whose type is not an allowed one
        const result = await bodyguard.softForm(createRawMultipartRequest([
            emptyFileInput("cover"),
            ['Content-Disposition: form-data; name="notes"; filename="a.txt"', 'Content-Type: text/plain', '', 'x'],
            emptyFileInput("extra"),
        ]));
        expect(result.success).toBe(true);

        // A chosen file is a file, even when it has no bytes
        const emptyButChosen = await bodyguard.softForm(createRawMultipartRequest([
            ['Content-Disposition: form-data; name="notes"; filename="a.txt"', 'Content-Type: text/plain', '', 'x'],
            ['Content-Disposition: form-data; name="more"; filename="empty.txt"', 'Content-Type: text/plain', '', ''],
        ]));
        expect(emptyButChosen.success).toBe(false);
        if (!emptyButChosen.success) expect(emptyButChosen.error.message).toBe(ERRORS.TOO_MANY_FILES);
    });

    it('reads nested parts the way it reads the others (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard();

        const [req] = createMultipartRequest({
            outer: {
                "päivä": "tänään",
                "ключ": "значение",
                inner: {
                    "名前": "値",
                },
            },
        });

        const result = await bodyguard.softForm(req);
        expect(result.success).toBe(true);
        if (result.success) expect(result.value).toEqual({ outer: { "päivä": "tänään", "ключ": "значение", inner: { "名前": "値" } } });
    });
});
