---
description: Bump version and publish the current Node-RED package to npm
allowed-tools: Bash, Read, Edit, Glob
---

# Publish Node-RED Package to npm

Automatically bump the version number, publish the current Node-RED package to npm, and push to GitHub.

## Steps

1. **Find the package**: Look for the nearest `package.json` in the current directory or parent directories, or use the package the user is currently working in.

2. **Read current version**: Get the current version from `package.json`.

3. **Bump version**: Increment the patch version (e.g., 0.1.0 → 0.1.1). If the user provides an argument like `major`, `minor`, or a specific version number, use that instead.

4. **Update package.json**: Write the new version to the file.

5. **Publish to npm**: Run `npm publish` from the package directory.

6. **Commit and push to GitHub**: Commit the version bump with message "chore: Bump <package-name> to v<version>" and push to origin.

7. **Report result**: Confirm the new version was published and pushed successfully.

## Usage

- `/publish-npm` - Bump patch version and publish
- `/publish-npm minor` - Bump minor version and publish
- `/publish-npm major` - Bump major version and publish
- `/publish-npm 1.2.3` - Set specific version and publish

## Arguments

$ARGUMENTS - Optional: version bump type (patch/minor/major) or specific version number

## Notes

- Ensure you are logged into npm (`npm whoami`)
- The package must have a valid `package.json` with Node-RED node configuration
- This works with monorepo structure - publishes the specific package, not the root
