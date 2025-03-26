import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';
import { createMultipartRequest } from './util.js';

describe('Multipart tests', () => {
    it('passes file upload (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard();

        const [req, boundary] = createMultipartRequest({
            "file\"; filename=\"hm.txt": "foobar"
        });

        const result = await bodyguard.softForm(req);

        expect(result.success).toBe(true);

        if (result.success && result.value) {
            const value = result.value as { file: File };
            expect(value.file instanceof File).toBe(true);
        } else {
            // This should not happen
            expect.fail("Result should be successful");
        }
    });

    it('throws if maxFiles is exceeded (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({
            maxFiles: 1
        });

        const [req, boundary] = createMultipartRequest({
            "file1\"; filename=\"hm.txt": "foobar",
            "file2\"; filename=\"hm2.txt": "foobar"
        });

        const result = await bodyguard.softForm(req);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_MANY_FILES);
        }
    });

    it('passes nested multipart form with arrays (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard();

        type ComplexData = {
            a: number;
            b: string;
            blbl: string;
            c: {
                d: number;
                e: string;
                f: {
                    bool1: string;
                    bool2: string;
                    bgfd: {
                        foo: string;
                    }
                };
                arr: (string | number)[];
                h: { j: { k: { l: string } } };
                array1: { re: string }[];
                array2: {
                    foo: {
                        bar: (string | { boo: string })[];
                        bax: { [key: number]: string };
                    }
                }[];
            };
        };

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

        const result = await bodyguard.softForm(req, undefined, {
            castNumbers: true,
        });

        expect(result.success).toBe(true);

        if (result.success && result.value) {
            const value = result.value as any;
            expect(value.a).toBe(reqData.a);
            expect(value.b).toBe(reqData.b);
            expect(value.blbl).toBe(reqData.blbl);
            expect(value.c.d).toBe(reqData.c.d);
            expect(value.c.e).toBe(reqData.c.e);
            expect(value.c.f.bool1).toBe('true');
            expect(value.c.f.bool2).toBe('false');
            expect(value.c.f.bgfd.foo).toBe(reqData.c.f.bgfd.foo);
            expect(value.c.arr[0]).toBe(reqData.c.arr[0]);
            expect(value.c.arr[1]).toBe(reqData.c.arr[1]);
            expect(value.c.h.j.k.l).toBe("foo");
            expect(value.c.array1[0].re).toBe("foobar");
            expect(value.c.array2[0].foo.bar[0]).toBe("baz1");
            expect(value.c.array2[0].foo.bar[1].boo).toBe("baz2");
            expect(value.c.array2[1]).toBe(undefined);
            expect(value.c.array2[2]).toBe(undefined);
            expect(value.c.array2[3]).toBe(undefined);
            expect(value.c.array2[4].foo.bar[0]).toBe("baz3");
            expect(value.c.array2[4].foo.bar[1]).toBe(undefined);
            expect(value.c.array2[4].foo.bar[2]).toBe(undefined);
            expect(value.c.array2[4].foo.bar[3]).toBe("baz4");
            expect(value.c.array2[4].foo.bax[0]).toBe(undefined);
            expect(value.c.array2[4].foo.bax[1]).toBe("baxx");
        }
    });

    it('casts numbers and booleans (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({
            castBooleans: true,
            castNumbers: true
        });

        const [req, boundary] = createMultipartRequest({
            a: "1",
            b: "true",
            c: "false",
        });

        type FormValues = {
            a: number;
            b: boolean;
            c: boolean;
        };

        const result = await bodyguard.softForm(req);

        expect(result.success).toBe(true);

        if (result.success) {
            const value = result.value as FormValues;
            expect(value.a).toBe(1);
            expect(value.b).toBe(true);
            expect(value.c).toBe(false);
        }
    });

    it('fails on prototype pollution (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard();

        const [req, boundary] = createMultipartRequest({
            a: 1,
        }, {
            prototypePollution: true
        });

        const result = await bodyguard.softForm(req);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });

    it('fails on too long keys (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard({
            maxKeyLength: 2,
        });

        const [req, boundary] = createMultipartRequest({
            abc: 1,
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softForm(req, validator);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.KEY_TOO_LONG);
        }
    });

    it('fails on too many input bytes (softForm with multipart)', async () => {
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

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.MAX_SIZE_EXCEEDED);
        }
    });

    it('fails on too many input keys (softForm with multipart)', async () => {
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

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_MANY_KEYS);
        }
    });

    it('fails on too deep input (softForm with multipart)', async () => {
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

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_DEEP);
        }
    });

    it('fails on broken boundary in header (softForm with multipart)', async () => {
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

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_CONTENT_TYPE);
        }
    });

    it('fails on no boundary in header (softForm with multipart)', async () => {
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

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_CONTENT_TYPE);
        }
    });

    it('passes webkit boundary without a preceding newline (softForm with multipart)', async () => {
        const bodyguard = new Bodyguard();

        const bodyArr = [
            '------WebKitFormBoundarylD5CPrRLWMEri7nf',
            'Content-Disposition: form-data; name="password"',
            '',
            'stset',
            '------WebKitFormBoundarylD5CPrRLWMEri7nf--',
            ''
        ];

        const bodyStr = bodyArr.join('\r\n');

        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(bodyStr));
                controller.close();
            }
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "multipart/form-data; boundary=----WebKitFormBoundarylD5CPrRLWMEri7nf"
            },
            body: stream,
            // @ts-ignore for duplex parameter
            duplex: "half"
        });

        const result = await bodyguard.softForm(req);
        expect(result.success).toBe(true);
    });
});