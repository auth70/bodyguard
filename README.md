<p align="center">
  <a href="https://github.com/auth70/bodyguard/actions"><img src="https://img.shields.io/github/actions/workflow/status/auth70/bodyguard/ci.yml?logo=github" alt="build"></a>
  <a href="https://www.npmjs.com/package/@auth70/bodyguard"><img src="https://img.shields.io/npm/v/@auth70/bodyguard" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@auth70/bodyguard"><img src="https://img.shields.io/npm/types/@auth70/bodyguard" alt="npm type definitions"></a>
</p>

# Bodyguard

Simple [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)-compatible, **streaming** body parser. Aims for ease of use with secure defaults.

Takes in a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) or [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object and parses its body into a JavaScript object. If you pass a typed schema validator using [Zod](https://zod.dev/) or similar library, the resulting object will also be typed.

Works in:

- Node.js
- Browser
- Bun
- Deno
- Cloudflare Workers and other serverless environments

## Quickstart

```bash
npm install --save @auth70/bodyguard
```

## Features

- **Parse (nested!) object *and* array form data with dot (`foo.bar`) and square bracket `(baz[0])` syntax** in both multipart and URL-encoded forms.
- **Parse file uploads in multipart form data** and return them as `File` objects.
- **Prevents resource exhaustion** by bailing early on streams that are too large, have too many (or too large) keys, or have too much nesting.
- **Guards against [prototype pollution](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html)** in JSON and form data.
- **Enforce parsed data to pass a validator** using a [Standard Schema](https://standardschema.dev/) object (Zod 4, Valibot, ArkType, …) or a throwing function *(optional)*.
- **Cast numbers and booleans from strings in form data** *(optional)*.
- **Transform parsed data before validation** so callers can coerce by schema shape without turning on global `castNumbers`/`castBooleans`.

### Supported content types

- ✅ JSON (`application/json`)
- ✅ Multi-boundary multipart form data (`multipart/form-data`)
- ✅ URL-encoded form data (`application/x-www-form-urlencoded`)
- ✅ Raw UTF-8 text (`text/plain`)

## Usage

**Each method in Bodyguard has two versions.** One that throws an error if the body is invalid (e.g. `form()`), and one that returns an error instead (e.g. `softForm()`). You may pick whichever suits your workflow.

**If you pass in a validator**, it may be either:

- a [Standard Schema v1](https://standardschema.dev/) object (for example a Zod 4 schema). Bodyguard calls `schema["~standard"].validate()` and, on failure, exposes `error.issues` as `{ code: "custom", path, message }[]`.
- a function that **throws** if the data is invalid and **returns** the parsed data if it is valid (for example `schema.parse` on Zod 3).

If you don't pass in a validator, the parsed data is returned as-is.

### Getting started

Initialise a Bodyguard instance with your preferred options. You can use it as a singleton or create multiple instances.

```ts
import { Bodyguard } from '@auth70/bodyguard';

// All arguments are optional with their defaults shown below
const bodyguard = new Bodyguard({
    maxSize: 1024 * 1024 * 1, // Default: 1MB
    maxKeys: 100, // Default: Allows up to 100 total keys
    maxDepth: 10, // Default: Allows up to 10 levels of nesting
    maxKeyLength: 100, // Default: Allows up to 100 characters per key
    castNumbers: false, // Default: Does NOT automatically cast numbers in form data
    castBooleans: false, // Default: Does NOT automatically cast "true" and "false" as boolean in form data
});
```

### Parsing

To parse a request body, you can either use the `pat()` / `softPat()` methods to have Bodyguard use the appropriate parser depending on the content type, or you can directly use the `json()` / `softJson()` or `form()` / `softForm()` methods to parse JSON and form data respectively.

For example, in a SvelteKit action:

```ts
// src/routes/+page.server.tsts
import { fail, type Actions } from '@sveltejs/kit';
import { Bodyguard } from '@auth70/bodyguard';
import { z } from 'zod';

// Define a validator, using Zod in this example
const RouteSchema = z.object({ name: z.string() }); 

const bodyguard = new Bodyguard(); // Or use a singleton, or put it in locals

export const actions = {
    default: async ({ request, locals }) => {
        // Use softForm() to parse the form into an object.
        // It does not throw an error if the body is invalid (compared to form() which does).
        const result = await bodyguard.softForm(
            request, // Pass in the request
            RouteSchema // Pass in a Standard Schema object (Zod 4) or a throwing parser (RouteSchema.parse)
        );

        if(!result.success) {
            // Narrow the type of result to BodyguardError
            return fail(400, { error: result.error });
        }
        // Narrow the type of result to BodyguardSuccess
        return { name: result.value.name };
    },
} satisfies Actions;
```

`options` are the same options you can pass to the instance constructor. Any options provided to a function will override the constructor options.

See [the API section](#api) for more information.

#### Response parsing

Even though these examples focus on Request bodies, there is nothing stopping you from using Bodyguard to parse and guard Response bodies as well, e.g. from user-supplied, untrusted APIs or webhooks.

## Parsing rules

### JSON

JSON data is returned like `JSON.parse()` would return it.

### Multipart form data

Trailing newlines are stripped from the end of values.

### URL-encoded form data

Values are decoded using `decodeURIComponent()`.

#### Handling plus (+) signs URL-encoded forms

If you are submitting a javascript-free form, you may want to convert `+` to spaces in the form data, as browsers regularly transform spaces into pluses when submitting urlencoded forms. Javascript submitted forms don't have this problem.

You can do this automatically by passing `convertPluses: true` as an option to `form()` or `softForm()`. It won't affect multipart form data, so consider using `enctype="application/x-www-form-urlencoded"` in your form tag if you need proper spaces and plus signs. Note that this is disabled by default, and if you enable it, you won't be able to distinguish between spaces and pluses in the form data.

### Common form data parsing

#### Numbers

*Auto-cast numbers by passing `castNumbers: true` as an option.*

If the value passes `!isNaN()` it's cast as a number. For example, `"3"` is returned as `3`, `"3.14"` is returned as `3.14`, etc. *This is disabled by default*. Leave it off when a value like a zip code (`"00123"`) must stay a string; coerce selected fields with `transform` instead.

#### Booleans

*Auto-cast booleans by passing `castBooleans: true` as an option.*

If the value is `"true"` or `"false"`, it's cast as a boolean. For example, `"true"` is returned as `true`, `"false"` is returned as `false`. *This is disabled by default*.

#### Empty strings

Empty strings are returned as empty strings (`""`), not `null` or `undefined`.

#### Form field name grammar

Bodyguard uses the same key grammar for `application/x-www-form-urlencoded` and `multipart/form-data`. The parsers are `extractNestedKey` (split on `.`) and `assignNestedValue` (optional `[index]` / `[]` suffix). Both are exported from the package, along with `possibleCast`, so other code can pin parity against them.

- `a.b` nests: `a.b=1` → `{ a: { b: "1" } }`
- `tags[]` appends: `tags[]=a&tags[]=b` → `{ tags: ["a", "b"] }`
- `items[0].name` indexes: `items[0].name=Ada` → `{ items: [{ name: "Ada" }] }`. Sparse holes are allowed (`items[2]=x` leaves index 0 and 1 empty).
- A repeated **plain** name keeps the last value: `a=1&a=2` → `{ a: "2" }`. Use `[]` when you want an array.
- `__proto__`, `constructor`, and `prototype` segments are refused.
- File parts stay [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) objects.

```html
<form>
    <input type="text" name="a_string" value="bar" />
    <input type="text" name="a_number" value="3" />
    <!-- array accessors -->
    <input type="text" name="an_array[]" value="foo" /> <!-- auto-incrementing index -->
    <input type="text" name="an_array[1]" value="bar" /> <!-- numeric index -->
    <!-- object accessors -->
    <input type="text" name="an_object.fox" value="fox" />
    <!-- nested object accessor -->
    <input type="text" name="an_object.dog.bark" value="bark" />
    <!-- nested object and array accessor -->
    <input type="text" name="an_object.cat[].meow" value="meow?" />
    <input type="text" name="an_object.cat[2].meow" value="meow!" /> <!-- leaves index 1 undefined -->
</form>
```

The above comes out as:

```ts
{
    a_string: 'bar',
    a_number: '3', // strings unless you opt into castNumbers or transform
    an_array: ['foo', 'bar'],
    an_object: {
        fox: 'fox',
        dog: {
            bark: 'bark',
        },
        cat: [
            { meow: 'meow?' },
            undefined,
            { meow: 'meow!' },
        ],
    },
}
```

---

## Examples

### Standard Schema example

<details>
<summary><strong>Expand example</strong></summary>

Pass a [Standard Schema](https://standardschema.dev/) object (Zod 4, Valibot, ArkType, …) instead of a throwing `.parse` function. On failure, `error.issues` is `{ code: "custom", path, message }[]`. Form values stay strings unless you coerce them with `transform` — leave `castNumbers` off so a zip code like `"00123"` is not turned into a number.

```ts
import { Bodyguard } from '@auth70/bodyguard';
import { z } from 'zod';

const bodyguard = new Bodyguard();

const StaySchema = z.object({
    "first-name": z.string(),
    "stay-start": z.string(),
    guests: z.number().int().positive(),
    zip: z.string(),
});

const result = await bodyguard.softForm(request, StaySchema, {
    transform: (value) => {
        const v = value as { guests?: string; zip?: string };
        return {
            ...v,
            guests: v.guests !== undefined ? Number(v.guests) : v.guests,
            zip: v.zip, // keep leading zeroes
        };
    },
});

if (!result.success) {
    // result.error.issues → [{ code: "custom", path: ["guests"], message: "..." }, ...]
    // result.value is the parsed (and transformed) input
    return { ok: false, issues: result.error.issues, value: result.value };
}

return { ok: true, stay: result.value };
```

Throwing methods work the same way: `form()` / `json()` / `pat()` throw an `Error` whose `.issues` is that mapped array. Function validators (`StaySchema.parse`) still work unchanged.

</details>

### SvelteKit example

<details>
<summary><strong>Expand example</strong></summary>

**routes/+page.server.ts**

```ts
import { z } from 'zod';
import { Bodyguard } from '@auth70/bodyguard';

const bodyguard = new Bodyguard(); // Or use a singleton, or put it in locals

const RouteSchema = z.object({ name: z.string() });

export const actions = {
    default: async ({ request, locals }) => {
        const { success, value } = await bodyguard.softForm(request, RouteSchema);
        /**
         * success: boolean
         * error?: Error
         * value?: { name: string }
         */
        if(!success) {
            return {
                status: 400,
                body: JSON.stringify({ error: error.message }),
            }
        }
        return {
            status: 302,
            headers: {
                location: `/${value.name}`,
            },
        }
    },
} satisfies Actions;
```
</details>

### Hono example

<details id="hono-example">
<summary><strong>Expand example</strong></summary>

**src/index.ts**

```ts
import { Bodyguard } from '@auth70/bodyguard';
import { Hono } from 'hono'

const app = new Hono()
const bodyguard = new Bodyguard();

app.use(
    '*',
        async (c, next) => {
            c.locals.bodyguard = bodyguard; // As a singleton in locals
            return next();
        }
    }
)

const RouteSchema = z.object({ name: z.string() });

app.post('/page', (c) => {
    const { success, value } = await c.locals.bodyguard.softForm(c.request, RouteSchema);
    /**
     * success: boolean
     * error?: Error
     * value?: { name: string }
     */
    if(!success) {
        return {
            status: 400,
            body: JSON.stringify({ error: error.message }),
        }
    }
    return {
        status: 302,
        headers: {
            location: `/${value.name}`,
        },
    }
})
```

</details>

---

## API

Below are the methods and types available in the Bodyguard class.

### Constructor

#### `new Bodyguard(config)`

- `config?`: `BodyguardConfig`

---

### Types

#### `BodyguardConfig`

- `maxSize?`: `number` - Maximum allowed size of the body in bytes. Default: `1024 * 1024 * 1` (1MB)
- `maxKeys?`: `number` - Maximum allowed number of keys in the body. Default: `100`
- `maxDepth?`: `number` - Maximum allowed depth of the body. Default: `10`
- `maxKeyLength?`: `number` - Maximum allowed length of a key in the body. Default: `100`
- `castNumbers?`: `boolean` - Whether to cast numbers from strings in form data. Default: `false`
- `castBooleans?`: `boolean` - Whether to cast `"true"` and `"false"` as booleans in form data. Default: `false`
- `transform?`: `(value: JSONLike) => JSONLike | Promise<JSONLike>` - Applied after parsing and before validation (form, JSON, and `pat` / `softPat`). Use this to coerce selected fields by schema shape. Default: `undefined`

#### `BodyguardFormConfig` (extends `BodyguardConfig`, used in `form()` and `softForm()`)

- `maxSize?`: `number` - Maximum allowed size of the body in bytes. Default: `1024 * 1024 * 1` (1MB)
- `maxKeys?`: `number` - Maximum allowed number of keys in the body. Default: `100`
- `maxDepth?`: `number` - Maximum allowed depth of the body. Default: `10`
- `maxKeyLength?`: `number` - Maximum allowed length of a key in the body. Default: `100`
- `castNumbers?`: `boolean` - Whether to cast numbers from strings in form data. Default: `false`
- `castBooleans?`: `boolean` - Whether to cast `"true"` and `"false"` as booleans in form data. Default: `false`
- `transform?`: `(value: JSONLike) => JSONLike | Promise<JSONLike>` - Applied after parsing and before validation. Default: `undefined`
- `convertPluses?`: `boolean` - Whether to convert `+` to spaces in urlencoded form data. Default: `false`
- `maxFiles?`: `number` - Maximum allowed number of files in the body. Default: `Infinity`
- `maxFilenameLength?`: `number` - Maximum allowed length of a filename in the body. Default: `255`
- `allowedContentTypes?`: `string[]` - Allowed content types for file uploads. Default: `undefined`

#### `BodyguardResult<T> = BodyguardSuccess<T> | BodyguardError<T>`

- `success`: `boolean` - Whether the parsing was successful.
- `error?`: `Error` - The error that occurred, if any.
- `value?`: `T` - The parsed value, if successful.

#### `BodyguardSuccess<T>`

- `success`: `true`
- `value`: `T`

#### `BodyguardError<T>`

- `success`: `false`
- `error`: `Error`
- `value?`: `T`

#### `BodyguardValidator<T = JSONLike> = (obj: JSONLike) => T`

A throwing function validator. Standard Schema v1 objects are also accepted anywhere a validator is accepted; the result type is then `StandardSchemaV1.InferOutput<T>`.

`StandardSchemaV1` (type) and `isStandardSchema()` are re-exported from the package entry.

`assignNestedValue`, `extractNestedKey`, and `possibleCast` are also exported for clients that need to match Bodyguard's form-key grammar.

---

### Form parsing

#### `Bodyguard.softForm<ValidatorType, ErrorType>(input, validator, options): Promise<BodyguardResult<ReturnType<ValidatorType>, ErrorType>>`

Parses an urlencoded or multipart form data stream into a JavaScript object. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardConfig>` - Optional config to override the constructor options.

Returns a `BodyguardResult`:

```ts
{
    success: boolean,
    error?: Error,
    value?: ReturnType<ValidatorType>,
}
```

#### `Bodyguard.form(input, validator, options): Promise<ReturnType<ValidatorType>>`

Parses an urlencoded or multipart form data stream into a JavaScript object. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardConfig>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

---

### JSON parsing

#### `Bodyguard.softJson<ValidatorType, ErrorType>(input, validator, options): Promise<BodyguardResult<ReturnType<ValidatorType>, ErrorType>>`

Parses a JSON stream into a JavaScript object. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardConfig>` - Optional config to override the constructor options.

Returns a `BodyguardResult`:

```ts
{
    success: boolean,
    error?: Error,
    value?: ReturnType<ValidatorType>,
}
```

#### `Bodyguard.json(input, validator, options): Promise<ReturnType<ValidatorType>>`

Parses a JSON stream into a JavaScript object. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardConfig>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

---

### Text parsing

#### `Bodyguard.softText<ValidatorType, ErrorType>(input, validator, options): Promise<BodyguardResult<ReturnType<ValidatorType>, ErrorType>>`

Parses raw UTF-8 text into a string. The byte limit is enforced but no key or depth limits are enforced as there is no way to know what the structure of the text is. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed string against.
- `config?: Partial<BodyguardConfig>` - Optional config to override the constructor options.

#### `Bodyguard.text(input, validator, options): Promise<ReturnType<ValidatorType>>`

Parses raw UTF-8 text into a string. The byte limit is enforced but no key or depth limits are enforced as there is no way to know what the structure of the text is. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed string against.
- `config?: Partial<BodyguardConfig>` - Optional config to override the constructor options.

---

### Automatic content type detection

#### `Bodyguard.softPat<ValidatorType, ErrorType>(input, validator, options): Promise<BodyguardResult<ReturnType<ValidatorType>, ErrorType>>`

Parses a request or response body into a JavaScript object. Internally uses `softJson()` or `softForm()` depending on the content type. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardConfig | BodyguardFormConfig>` - Optional config to override the constructor options.

Returns a `BodyguardResult`:

```ts
{
    success: boolean,
    error?: Error,
    value?: ReturnType<ValidatorType>,
}
```

#### `Bodyguard.pat(input, validator, options): Promise<ReturnType<ValidatorType>>`

Parses a request or response body into a JavaScript object. Internally uses `json()` or `form()` depending on the content type. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardConfig | BodyguardFormConfig>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## License

MIT
