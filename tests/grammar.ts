import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS } from '../src/lib.js';
import { createUrlencodedRequest, createFormDataRequest } from './util.js';

describe('Key grammar tests', () => {
    const encodings = [
        ["urlencoded", createUrlencodedRequest],
        ["multipart", createFormDataRequest],
    ] as const;

    for (const [encoding, createRequest] of encodings) {
        it(`never writes on a built-in through an inherited name (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();
            const builtIns = Object.prototype as Record<string, any>;

            try {
                const result = await bodyguard.softForm(createRequest([
                    ["toString.call", "x"],
                    ["hasOwnProperty.call", "x"],
                    ["valueOf.polluted", "x"],
                ]));

                expect(Object.hasOwn(builtIns.toString, "call")).toBe(false);
                expect(Object.hasOwn(builtIns.hasOwnProperty, "call")).toBe(false);
                expect(Object.hasOwn(builtIns.valueOf, "polluted")).toBe(false);
                expect(Object.prototype.toString.call([])).toBe("[object Array]");

                // The names are ordinary keys of the result
                expect(result.success).toBe(true);
                if (result.success) {
                    const value = result.value as Record<string, any>;
                    expect(Object.keys(value)).toEqual(["toString", "hasOwnProperty", "valueOf"]);
                    expect(value.toString).toEqual({ call: "x" });
                    expect(value.hasOwnProperty).toEqual({ call: "x" });
                    expect(value.valueOf).toEqual({ polluted: "x" });
                }
            } finally {
                // A regression must fail this test, not break the test runner after it
                delete builtIns.toString.call;
                delete builtIns.hasOwnProperty.call;
                delete builtIns.valueOf.polluted;
            }
        });

        it(`fails on a key that contradicts an earlier one (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            const contradictions: [string, string][][] = [
                [["a", "1"], ["a.b", "2"]],
                [["a.b", "1"], ["a", "2"]],
                [["a", "1"], ["a[]", "2"]],
                [["a[]", "1"], ["a", "2"]],
                [["a.b", "1"], ["a[]", "2"]],
                [["a[]", "1"], ["a.b", "2"]],
                [["a[0]", "1"], ["a[0].b", "2"]],
                [["a[0].b", "1"], ["a[0]", "2"]],
            ];

            for (const pairs of contradictions) {
                const result = await bodyguard.softForm(createRequest(pairs));
                expect(result.success).toBe(false);
                if (!result.success) expect(result.error.message).toBe(ERRORS.KEY_CONFLICT);
            }
        });

        it(`keeps the last value where keys agree on what a place is (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            const result = await bodyguard.softForm(createRequest([
                ["a", "1"], ["a", "2"],
                ["b[0]", "1"], ["b[0]", "2"],
                ["c.d", "1"], ["c.e", "2"],
                ["f[]", "1"], ["f[]", "2"],
            ]));

            expect(result.success).toBe(true);
            if (result.success) expect(result.value).toEqual({ a: "2", b: ["2"], c: { d: "1", e: "2" }, f: ["1", "2"] });
        });

        it(`starts the next item when a key comes round again (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            const result = await bodyguard.softForm(createRequest([
                ["rows[].name", "a"], ["rows[].age", "1"],
                ["rows[].name", "b"], ["rows[].age", "2"],
            ]));

            expect(result.success).toBe(true);
            if (result.success) expect(result.value).toEqual({ rows: [{ name: "a", age: "1" }, { name: "b", age: "2" }] });
        });

        it(`starts the next item when an index comes round again (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            const result = await bodyguard.softForm(createRequest([
                ["rows[].cells[0]", "a"], ["rows[].name", "n1"],
                ["rows[].cells[0]", "b"], ["rows[].name", "n2"],
            ]));

            expect(result.success).toBe(true);
            if (result.success) expect(result.value).toEqual({ rows: [{ cells: ["a"], name: "n1" }, { cells: ["b"], name: "n2" }] });
        });

        it(`keeps a list inside the item being built (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            const result = await bodyguard.softForm(createRequest([
                ["rows[].tags[]", "x"], ["rows[].tags[]", "y"], ["rows[].name", "a"],
                ["rows[].name", "b"],
            ]));

            expect(result.success).toBe(true);
            if (result.success) expect(result.value).toEqual({ rows: [{ tags: ["x", "y"], name: "a" }, { name: "b" }] });
        });

        it(`builds rows that begin with a field that always posts (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            // An unticked checkbox posts nothing: the first row has no `done`
            const result = await bodyguard.softForm(createRequest([
                ["rows[].name", "a"],
                ["rows[].name", "b"], ["rows[].done", "on"],
            ]));

            expect(result.success).toBe(true);
            if (result.success) expect(result.value).toEqual({ rows: [{ name: "a" }, { name: "b", done: "on" }] });
        });

        it(`fails on an index that the keys allowed could never fill (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard({ maxKeys: 10 });

            const fits = await bodyguard.softForm(createRequest([["a[9]", "x"]]));
            expect(fits.success).toBe(true);

            for (const name of ["a[10]", "a[4294967294]", "a[99999999999999999999]", "rows[10].name"]) {
                const result = await bodyguard.softForm(createRequest([[name, "x"]]));
                expect(result.success).toBe(false);
                if (!result.success) expect(result.error.message).toBe(ERRORS.INDEX_TOO_LARGE);
            }
        });

        it(`keeps a bound on the index when maxKeys has none (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard({ maxKeys: Infinity });

            const result = await bodyguard.softForm(createRequest([["a[4294967294]", "x"]]));
            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.message).toBe(ERRORS.INDEX_TOO_LARGE);
        });

        it(`fails on forbidden segments anywhere in a path (softForm with ${encoding})`, async () => {
            const bodyguard = new Bodyguard();

            for (const name of ["a.__proto__.b", "a[0].constructor", "a.prototype[]", "constructor.prototype.polluted"]) {
                const result = await bodyguard.softForm(createRequest([[name, "x"]]));
                expect(result.success).toBe(false);
                if (!result.success) expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
            }

            expect(({} as Record<string, any>).polluted).toBe(undefined);
        });
    }
});
