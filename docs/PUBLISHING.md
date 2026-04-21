# Publishing Checklist

This project now has the basic package structure needed for publishing, but `wafermap` is not published yet.

## Before Publishing

1. Confirm the final package name is available on npm.
2. Review `package.json` metadata:
   - `name`
   - `version`
   - `description`
   - `license`
3. Run:

```bash
npm test
npm run pack:check
```

4. Inspect the tarball contents from `npm pack --dry-run` and confirm only the intended files ship.
5. Review [readme.md](/home/paul/projects/wmap/readme.md:1) and [docs/API.md](/home/paul/projects/wmap/docs/API.md:1) for publish-facing clarity.

## Local Packaging Check

Use this to verify the package payload without publishing:

```bash
npm run pack:check
```

If you want an actual tarball locally:

```bash
npm pack
```

## Publishing

When ready:

```bash
npm publish
```

If the package name changes or a scoped package is used, update the manifest first.

## Recommended Future Improvements

- Add repository / bugs / homepage metadata once the public hosting location is finalized.
- Add CI to run `npm test` and `npm run pack:check`.
- Add changelog / release notes workflow.
- Add a bundler-based consumer example before first public release.
