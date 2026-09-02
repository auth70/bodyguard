import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Bodyguard, isStandardSchema } from '../src/index.js';
import type { GenericIssue, JSONLike, StandardSchemaV1 } from '../src/index.js';

function urlencoded(body: string): Request {
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body
    });
}

function jsonRequest(body: unknown): Request {
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    });
}

function handrolled<Output>(
    validate: StandardSchemaV1.Props<unknown, Output>["validate"]
): StandardSchemaV1<unknown, Output> {
    return {
        "~standard": {
            version: 1,
            vendor: "test",
            validate,
        }
    };
}

describe('isStandardSchema', () => {
    it('detects a Standard Schema v1 object', () => {
        const schema = handrolled((value) => ({ value }));
        expect(isStandardSchema(schema)).toBe(true);
    });

    it('rejects function validators and unrelated values', () => {
        const parse = (data: unknown): JSONLike => data as JSONLike;
        expect(isStandardSchema(parse)).toBe(false);
        expect(isStandardSchema(undefined)).toBe(false);
        expect(isStandardSchema(null)).toBe(false);
        expect(isStandardSchema({})).toBe(false);
        expect(isStandardSchema({ "~standard": { version: 1 } })).toBe(false);
        expect(isStandardSchema({ "~standard": { version: 2, validate: () => ({ value: 1 }) } })).toBe(false);
    });

    it('detects a zod 4 schema object', () => {
        expect(isStandardSchema(z.object({ name: z.string() }))).toBe(true);
        expect(isStandardSchema(z.object({ name: z.string() }).parse)).toBe(false);
    });
});

describe('Standard Schema v1 (hand-rolled)', () => {
    it('sync validate success returns the schema output value (softForm)', async () => {
        const bodyguard = new Bodyguard();
        const schema = handrolled<{ name: string; extra: boolean }>((value) => ({
            value: { ...(value as { name: string }), extra: true }
        }));

        const result = await bodyguard.softForm(urlencoded("name=Ada"), schema);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toEqual({ name: "Ada", extra: true });
        }
    });

    it('async validate success returns the schema output value (form)', async () => {
        const bodyguard = new Bodyguard();
        const schema = handrolled<{ name: string }>(async (value) => ({
            value: value as { name: string }
        }));

        const result = await bodyguard.form(urlencoded("name=Ada"), schema);
        expect(result).toEqual({ name: "Ada" });
    });

    it('sync failure maps nested paths, array indices, and { key } segments', async () => {
        const bodyguard = new Bodyguard();
        const schema = handrolled(() => ({
            issues: [
                { message: "nested", path: ["user", "name"] },
                { message: "index", path: ["tags", 0] },
                { message: "keyed", path: [{ key: "first-name" }] },
            ]
        }));

        const result = await bodyguard.softForm(urlencoded("user.name=x&tags[]=a&first-name=Ada"), schema);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toEqual<GenericIssue[]>([
                { code: "custom", path: ["user", "name"], message: "nested" },
                { code: "custom", path: ["tags", 0], message: "index" },
                { code: "custom", path: ["first-name"], message: "keyed" },
            ]);
            expect(result.value).toEqual({
                user: { name: "x" },
                tags: ["a"],
                "first-name": "Ada",
            });
        }
    });

    it('async failure maps issues on the throwing variant', async () => {
        const bodyguard = new Bodyguard();
        const schema = handrolled(async () => ({
            issues: [
                { message: "nested", path: ["user", "name"] },
                { message: "index", path: ["tags", 1] },
                { message: "keyed", path: [{ key: "stay-start" }] },
            ]
        }));

        try {
            await bodyguard.form(urlencoded("a=1"), schema);
            expect.fail("form() should have thrown");
        } catch (err) {
            const error = err as Error & { issues: GenericIssue[] };
            expect(error.issues).toEqual([
                { code: "custom", path: ["user", "name"], message: "nested" },
                { code: "custom", path: ["tags", 1], message: "index" },
                { code: "custom", path: ["stay-start"], message: "keyed" },
            ]);
        }
    });

    it('soft variants keep the parsed value on validation failure (softJson)', async () => {
        const bodyguard = new Bodyguard();
        const parsed = { user: { name: 1 }, tags: ["ok"] };
        const schema = handrolled(() => ({
            issues: [{ message: "bad", path: ["user", "name"] }]
        }));

        const result = await bodyguard.softJson(jsonRequest(parsed), schema);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toEqual([
                { code: "custom", path: ["user", "name"], message: "bad" },
            ]);
            expect(result.value).toEqual(parsed);
        }
    });

    it('transform runs before validation and sees the parsed object', async () => {
        const bodyguard = new Bodyguard();
        const seen: unknown[] = [];
        const schema = handrolled<{ age: number }>((value) => {
            const typed = value as { age: unknown };
            if (typeof typed.age !== "number") {
                return { issues: [{ message: "age must be a number", path: ["age"] }] };
            }
            return { value: { age: typed.age } };
        });

        const result = await bodyguard.softForm(urlencoded("age=21&zip=00123"), schema, {
            transform: (value) => {
                seen.push(value);
                const record = value as { age: string; zip: string };
                return { age: Number(record.age), zip: record.zip };
            }
        });

        expect(seen).toEqual([{ age: "21", zip: "00123" }]);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toEqual({ age: 21 });
        }
    });

    it('does not cast numeric strings without transform (zip stays a string)', async () => {
        const bodyguard = new Bodyguard();
        const schema = handrolled<{ zip: string }>((value) => ({
            value: value as { zip: string }
        }));

        const result = await bodyguard.softForm(urlencoded("zip=00123"), schema);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toEqual({ zip: "00123" });
        }
    });

    it('a throwing function validator still works', async () => {
        const bodyguard = new Bodyguard();
        const validator = (data: unknown): JSONLike => {
            throw new Error("nope");
        };

        await expect(bodyguard.form(urlencoded("a=1"), validator)).rejects.toThrow("nope");

        const result = await bodyguard.softForm(urlencoded("a=1"), validator);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toBe("nope");
            expect(result.value).toEqual({ a: "1" });
        }
    });

    it('pat() with a JSON body takes the same Standard Schema path', async () => {
        const bodyguard = new Bodyguard();
        const success = handrolled<{ a: number }>((value) => ({
            value: value as { a: number }
        }));
        const failure = handrolled(() => ({
            issues: [{ message: "bad a", path: [{ key: "a" }] }]
        }));

        const ok = await bodyguard.pat(jsonRequest({ a: 1 }), success);
        expect(ok).toEqual({ a: 1 });

        const soft = await bodyguard.softPat(jsonRequest({ a: "x" }), failure);
        expect(soft.success).toBe(false);
        if (!soft.success) {
            expect(soft.error.issues).toEqual([
                { code: "custom", path: ["a"], message: "bad a" },
            ]);
            expect(soft.value).toEqual({ a: "x" });
        }
    });
});

describe('Standard Schema v1 (zod 4)', () => {
    const schema = z.object({
        user: z.object({
            name: z.string(),
        }),
        tags: z.array(z.string()),
    });

    it('success returns the output value', async () => {
        const bodyguard = new Bodyguard();
        const body = { user: { name: "Ada" }, tags: ["a", "b"] };

        const result = await bodyguard.softJson(jsonRequest(body), schema);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.value).toEqual(body);
        }
    });

    it('async-compatible validate via form + transform', async () => {
        const bodyguard = new Bodyguard();
        const result = await bodyguard.form(urlencoded("user.name=Ada&tags[]=a&tags[]=b"), schema, {
            transform: (value) => value
        });

        expect(result).toEqual({
            user: { name: "Ada" },
            tags: ["a", "b"],
        });
    });

    it('failure maps nested paths and array indices; soft keeps parsed value', async () => {
        const bodyguard = new Bodyguard();
        const parsed = { user: { name: 1 }, tags: [true] };

        const result = await bodyguard.softJson(jsonRequest(parsed), schema);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.value).toEqual(parsed);
            expect(result.error.issues?.length).toBeGreaterThan(0);
            for (const issue of result.error.issues ?? []) {
                expect(issue.code).toBe("custom");
                expect(typeof issue.message).toBe("string");
            }
            const paths = (result.error.issues ?? []).map((issue) => issue.path);
            expect(paths).toContainEqual(["user", "name"]);
            expect(paths).toContainEqual(["tags", 0]);
        }
    });

    it('pat() with a JSON body uses the schema object', async () => {
        const bodyguard = new Bodyguard();
        const body = { user: { name: "Ada" }, tags: ["x"] };

        const value = await bodyguard.pat(jsonRequest(body), schema);
        expect(value).toEqual(body);

        const soft = await bodyguard.softPat(jsonRequest({ user: { name: 1 }, tags: [] }), schema);
        expect(soft.success).toBe(false);
        if (!soft.success) {
            expect(soft.value).toEqual({ user: { name: 1 }, tags: [] });
            expect(soft.error.issues?.[0]?.code).toBe("custom");
            expect(soft.error.issues?.[0]?.path).toEqual(["user", "name"]);
        }
    });
});
