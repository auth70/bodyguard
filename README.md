# @auth70/bodyguard

```bash
npm install --save @auth70/bodyguard
```

## Description

Opinionated Fetch API compatible streaming body parser and guard with no Node.js specific dependencies.

### Features

- Simple, 100% test covered, ESM-only API that's hard to mess up written in TypeScript.
- Supports only UTF-8 and the most common content types for JSON and form parsing.
- Automatically parses JSON and form data streams into JavaScript objects.
- Prevents resource exhaustion by bailing early on streams that are too large, have too many (or too large) keys, or have too much nesting.
- Allows nested object and array form data with dot and square bracket syntax in both multipart and URL-encoded forms.
- Allows nested (multi-boundary) multipart form data.
- *Optional:* Enforce parsed data to pass a user-chosen validator (e.g. Zod) - this gives you types on the result object.
- *Optional:* Cast numbers and booleans from strings in form data.

### TODO

- File uploads in multipart form data.

## Usage

Initialise a Bodyguard instance with your preferred options and use it as a singleton.

```ts
import { Bodyguard } from '@auth70/bodyguard';

// All arguments are optional with their defaults shown below
const bodyguard = new Bodyguard({
    maxSize: 1024 * 1024 * 1, // Default: 1MB
    maxKeys: 100, // Default: Allows up to 100 total keys
    maxDepth: 10, // Default: Allows up to 10 levels of nesting
    maxKeyLength: 100, // Default: Allows up to 100 characters per key
    castNumbers: true, // Default: DOES automatically cast numbers in form data
    castBooleans: false, // Default: does NOT automatically cast "true" and "false" as boolean in form data
});
```

Then in a route, use:

- `json(request, validator, options)`/`form(request, validator, options)` (throws an error), or
- `softJson(request, validator, options)`/`softForm(request, validator, options)` (returns an error)

to parse the request body into a JavaScript object. `options` are the same options you can pass to the constructor, including `validator`. Any options will override the constructor options.

```ts
const routeOptions = {
    maxKeys: 1000
}
const { success, value, error } = await bodyguard.softForm(request, validator, routeOptions);
```

See [the API section](#api) for more information.

### Response body parsing

Even though these examples focus on Request bodies, there is nothing stopping you from using Bodyguard to parse and guard Response bodies as well, e.g. from user-supplied, untrusted APIs or webhooks.

### Supported content types

#### application/json

`JSON.parse()` compatible parsing using [@streamparser/json](https://github.com/juanjoDiaz/streamparser-json).

#### multipart/form-data

Using [@exact-realty/multipart-parser](https://github.com/Exact-Realty/ts-multipart-parser).

Form data is automatically mapped into a JavaScript object, with support for:

- Strings and numbers
- Optionally casted booleans
- Nested objects using dot notation syntax
- Nested arrays using square bracket syntax, with support for both numeric and auto-incrementing indexes

See [Parsing rules](#parsing-rules) for more information.

#### application/x-www-form-urlencoded

Using an internal streaming parser.

URL-encoded form data is automatically mapped into a JavaScript object, with support for:

- Strings and numbers
- Optionally casted booleans
- Nested objects using dot notation syntax
- Nested arrays using square bracket syntax, with support for both numeric and auto-incrementing indexes

## Examples

### SvelteKit example

<details>
<summary><strong>Expand example</strong></summary>

**src/global.d.ts**

```ts
/// <reference types="@sveltejs/kit" />

import type { Bodyguard } from '@auth70/bodyguard';

declare global {
    namespace App {
        interface Locals {
            bodyguard: Bodyguard
        }
    }
}

export {};
```

**src/hooks.server.ts**

```ts
import { Bodyguard } from '@auth70/bodyguard';
import type { Handle } from '@sveltejs/kit'

const bodyguard = new Bodyguard();

export const handle = (async ({ event, resolve }) => {
    event.locals.bodyguard = bodyguard;
    return resolve(event);
}) satisfies Handle;
```

**routes/+page.server.ts**

```ts
import { z } from 'zod';

const RouteSchema = z.object({ name: z.string() });

export const actions = {
    default: async ({ request, locals }) => {
        const { success, value } = await locals.bodyguard.softForm(request, RouteSchema.parse);
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
            c.locals.bodyguard = bodyguard;
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

### Next.js example

<details id="hono-example">
<summary><strong>Expand example</strong></summary>
TODO (PR welcome)
</details>

## Parsing rules

### JSON

JSON data is returned like `JSON.parse()` would return it.

### Form data

- Trailing newline is stripped from the end of the value for multipart form data.
- URL encoded values are decoded using `decodeURIComponent()`.

#### Numbers

If the value passes `!isNaN()` it's cast as a number. i.e. `"3"` is returned as `3`, `"3.14"` is returned as `3.14`, etc.

#### Booleans

*Booleans are not cast automatically by default.* If the value is `"true"` or `"false"`, it's **not** cast as a boolean but returned as a string unless you specify `castBooleans` as `true` in parser configuration. This is to prevent accidental casting of values that are not intended to be booleans.

#### Empty strings

Empty strings are returned as `""`.

#### Array indices with gaps

Array indices with gaps are returned as sparse arrays. i.e. `foo[1] = "3"` is returned as `foo: [undefined, 3]`.

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

Comes out as:

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
- `castNumbers` (optional): `boolean` - Whether to cast numbers from strings in form data. Default: `true`
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

### JSON parsing

#### `Bodyguard.softJson(input: Request | Response, validator?: T, options?: BodyguardOptions): Promise<BodyguardResult<ReturnType<ValidatorType>>>`

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

#### `Bodyguard.json(input, validator?, config?): Promise<ReturnType<ValidatorType>>`

Parses a JSON stream into a JavaScript object. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

### Form parsing

#### `Bodyguard.softForm(input: Request | Response, validator?: T, options?: BodyguardOptions): Promise<BodyguardResult<ReturnType<ValidatorType>>>`

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

#### `Bodyguard.form(input, validator?, options?): Promise<ReturnType<ValidatorType>>`

Parses an urlencoded or multipart form data stream into a JavaScript object. Errors are thrown.

- `input: Request | Response` - Fetch API compatible input.
- `validator?: ValidatorType extends BodyguardValidator` - Optional validator to validate the parsed object against.
- `config?: Partial<BodyguardOptions>` - Optional config to override the constructor options.

Returns the parsed object (not a `BodyguardResult`).

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT
