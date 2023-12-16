![Fox knight](https://github.com/auth70/bodyguard/assets/55932282/01db31c8-fb8f-4a40-9b4b-027836c695b3)

<p align="center">
  <a href="https://www.npmjs.com/package/@auth70/bodyguard"><img src="https://img.shields.io/npm/v/@auth70/bodyguard" alt="npm"></a>
  <a href="https://www.npmjs.com/package/@auth70/bodyguard"><img src="https://img.shields.io/npm/types/@auth70/bodyguard" alt="npm type definitions"></a>
</p>

# Bodyguard

Simple [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)-compatible streaming body parser. Aims for ease of use with secure defaults. Does not depend on Node.js APIs.

Takes in a [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) or [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object and parses its body into a JavaScript object. If you pass a typed schema validator using [Zod](https://zod.dev/) or similar library, the resulting object will also be typed.

## Quickstart

```bash
npm install --save @auth70/bodyguard
```

## Features

- **Parse (nested!) object *and* array form data with dot (`foo.bar`) and square bracket `(baz[0])` syntax** in both multipart and URL-encoded forms.
- **Prevents resource exhaustion** by bailing early on streams that are too large, have too many (or too large) keys, or have too much nesting.
- **Guards against [prototype pollution](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html)** in JSON and form data.
- **Enforce parsed data to pass a validator** using [Zod](https://zod.dev/) or similar library *(optional)*.
- **Cast numbers and booleans from strings in form data** *(optional)*.

### Supported content types

- ✅ JSON (`application/json`)
- ✅ Multi-boundary multipart form data (`multipart/form-data`)
- ✅ URL-encoded form data (`application/x-www-form-urlencoded`)
- ✅ Raw UTF-8 text (`text/plain`)

#### TODO

- File uploads in multipart form data.

## Usage

**Each method in Bodyguard has two versions.** One that throws an error if the body is invalid (e.g. `form()`), and one that returns an error instead (e.g. `softForm()`). You may pick whichever suits your workflow.

**If you pass in a validator, it *has* to throw an error if the data is invalid.** If the data is valid, it should return the parsed data. If you don't pass in a validator, the parsed data is returned as-is.

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
// src/routes/+page.server.ts
import { z } from 'zod';

// Define a validator, using Zod in this example
const RouteSchema = z.object({ name: z.string() }); 

export const actions = {
    default: async ({ request, locals }) => {
        const { success, error, value } = await locals.bodyguard.softForm(
            request, // Pass in the request
            RouteSchema.parse // Pass in the validator
        );
        /**
         * success: boolean
         * error?: Error
         * value?: { name: string } <-- typed!
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

`options` are the same options you can pass to the instance constructor. Any options provided to a function will override the constructor options.

See [the API section](#api) for more information.

#### Response parsing

Even though these examples focus on Request bodies, there is nothing stopping you from using Bodyguard to parse and guard Response bodies as well, e.g. from user-supplied, untrusted APIs or webhooks.

## Parsing rules

### JSON

JSON data is returned like `JSON.parse()` would return it.

### Form data

#### Multipart forms

Trailing newlines are stripped from the end of values.

#### URL-encoded forms

Values are decoded using `decodeURIComponent()`

#### Numbers

*Auto-cast numbers by passing `castNumbers: true` as an option.*

If the value passes `!isNaN()` it's cast as a number. For example, `"3"` is returned as `3`, `"3.14"` is returned as `3.14`, etc. *This is disabled by default*.

#### Booleans

*Auto-cast booleans by passing `castBooleans: true` as an option.*

If the value is `"true"` or `"false"`, it's cast as a boolean. For example, `"true"` is returned as `true`, `"false"` is returned as `false`. *This is disabled by default*.

#### Empty strings

Empty strings are returned as empty strings (`""`), not `null` or `undefined`.

#### Array indices with gaps

Array indices with gaps are returned as sparse arrays. For example, `foo[1] = "3"` is returned as `foo: [undefined, 3]`.

#### Object and array form data

To parse objects from form data, use dot notation in the input name accessor. For arrays, use square brackets.

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
    a_number: 3,
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

## Examples

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
        const { success, value } = await bodyguard.softForm(request, RouteSchema.parse);
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
    const { success, value } = await c.locals.bodyguard.softForm(c.request, RouteSchema.parse);
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

## API

### Constructor

#### `new Bodyguard(config)`

- `options` (optional): `BodyguardConfig`

### Types

#### `BodyguardConfig`

- `maxSize` (optional): `number` - Maximum allowed size of the body in bytes. Default: `1024 * 1024 * 1` (1MB)
- `maxKeys` (optional): `number` - Maximum allowed number of keys in the body. Default: `100`
- `maxDepth` (optional): `number` - Maximum allowed depth of the body. Default: `10`
- `maxKeyLength` (optional): `number` - Maximum allowed length of a key in the body. Default: `100`
- `castNumbers` (optional): `boolean` - Whether to cast numbers from strings in form data. Default: `false`
- `castBooleans` (optional): `boolean` - Whether to cast `"true"` and `"false"` as booleans in form data. Default: `false`

#### `BodyguardResult<T> = BodyguardSuccess<T> | BodyguardError`

- `success`: `boolean` - Whether the parsing was successful.
- `error` (optional): `Error` - The error that occurred, if any.
- `value` (optional): `T` - The parsed value, if successful.

#### `BodyguardSuccess<T>`

- `success`: `true`
- `value`: `T`

#### `BodyguardError`

- `success`: `false`
- `error`: `Error`

#### `BodyguardValidator<T = JSONLike> = (obj: JSONLike) => T`

### Automatic content type detection

#### `Bodyguard.softPat(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<BodyguardResult<ReturnType<ValidatorType>>>`

Parses a request or response body into a JavaScript object. Internally uses `softJson()` or `softForm()` depending on the content type. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns a `BodyguardResult`:

```ts
{
    success: boolean,
    error?: Error,
    value?: ReturnType<ValidatorType>,
}
```

#### `Bodyguard.pat(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<ReturnType<ValidatorType>>`

Parses a request or response body into a JavaScript object. Internally uses `json()` or `form()` depending on the content type. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

### JSON parsing

#### `Bodyguard.softJson(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<BodyguardResult<ReturnType<ValidatorType>>>`

Parses a JSON stream into a JavaScript object. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns a `BodyguardResult`:

```ts
{
    success: boolean,
    error?: Error,
    value?: ReturnType<ValidatorType>,
}
```

#### `Bodyguard.json(input: Request | Response, validator?: ValidatorType, config?: BodyguardOptions): Promise<ReturnType<ValidatorType>>`

Parses a JSON stream into a JavaScript object. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

### Form parsing

#### `Bodyguard.softForm(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<BodyguardResult<ReturnType<ValidatorType>>>`

Parses an urlencoded or multipart form data stream into a JavaScript object. If an error occurs, it is returned instead of throwing.

- `request`: `Request` - The request to parse.
- `validator` (optional): `ValidatorType extends BodyguardValidator` - A validator to validate the parsed object against. Default: `undefined`
- `options` (optional): `BodyguardOptions` - Options to override the constructor options. Default: `undefined`

Returns a `BodyguardResult`:

```ts
{
    success: boolean,
    error?: Error,
    value?: ReturnType<ValidatorType>,
}
```

#### `Bodyguard.form(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<ReturnType<ValidatorType>>`

Parses an urlencoded or multipart form data stream into a JavaScript object. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

### Text parsing

#### `Bodyguard.softText(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<BodyguardResult<ReturnType<ValidatorType>>>`

Parses raw UTF-8 text into a string. The byte limit is enforced but no key or depth limits are enforced as there is no way to know what the structure of the text is. If an error occurs, it is returned instead of throwing.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed string against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

#### `Bodyguard.text(input: Request | Response, validator?: ValidatorType, options?: BodyguardOptions): Promise<ReturnType<ValidatorType>>`

Parses raw UTF-8 text into a string. The byte limit is enforced but no key or depth limits are enforced as there is no way to know what the structure of the text is. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed string against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT
