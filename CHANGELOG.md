# Changelog

## 1.6.2 (2024-04-05)

Better GenericIssue type

## 1.6.1 (2024-04-05)

Updated dependencies

## 1.6.0 (2024-04-05)

`soft` versions now include a [typed error property `GenericError { issues?: GenericIssue[] }`](./src/lib.ts#L73), which is the error thrown by the validator. It is based on a Zod error, but you may type it as something else if your parser throws a different error type. This is helpful for type narrowing (ie. you don't have to type `(result.error as any).issues` to get to the issues).

If you're not using Zod, to type the error property, pass it as the second generic type argument to `soft` methods. For example, `softForm<typeof myschema.parse, MyErrorType>(obj, myschema.parse)`. Note that you have to also manually type the parser if you want type its error differently.

## 1.5.2 (2024-04-03)

`soft` versions can now also return the parsed value if there was one returned but it did not pass the validation. This is useful when you want to show the user the parsed value in the form after a validation error.

## 1.5.1 (2024-04-03)

Added missing export for `BodyguardFormConfig` interface

## 1.5.0 (2024-02-20)

### New Features

**File upload support in multipart forms.** `form()` and `softForm()` will return uploaded files as [File objects](https://developer.mozilla.org/en-US/docs/Web/API/File).

## 1.4.0 (2024-02-19)

- **Breaking:** The `error` returned from `soft*` methods is now the error thrown by the handler without coercing it into a string. If you need further type narrowing, you can use the `as` operator in your catch block. Bodyguard errors are regular `Error` instances with the message as one of the consts from `ERRORS`.

- You can pass `convertPluses` as an option to the form methods to convert `+` to spaces in the form data when it's submitted in URL-encoded format. It won't affect multipart form data.
