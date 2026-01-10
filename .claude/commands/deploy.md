# Deploy to Local Node-RED

Deploy a package from this monorepo to the local Node-RED instance.

## Usage
```
/deploy [package-name]
```

If no package name is provided, detect from the current working directory or ask the user.

## Steps

1. **Identify the package** to deploy:
   - If argument provided, use it (e.g., `node-red-contrib-event-calc`)
   - Otherwise, check if we're in a package directory under `packages/`
   - If ambiguous, list available packages and ask user to choose

2. **Find the Node-RED user directory**:
   - Windows: `%USERPROFILE%\.node-red` (typically `C:\Users\<username>\.node-red`)
   - Linux/Mac: `~/.node-red`
   - Verify the directory exists

3. **Install the package locally**:
   ```bash
   cd <node-red-user-dir>
   npm install <path-to-package>
   ```

   For example:
   ```bash
   cd C:\Users\holge\.node-red
   npm install c:\repos\nore-red-contrib\packages\node-red-contrib-event-calc
   ```

4. **Notify the user**:
   - Package installed successfully
   - Remind them to restart Node-RED or use the "Restart Flows" option in the Node-RED menu

## Available Packages

List packages from the `packages/` directory in the monorepo root.

## Notes

- This creates a symlink/local install, so changes to the source are reflected after Node-RED restart
- No need to re-run deploy after code changes, just restart Node-RED
- Use `npm ls` in the Node-RED directory to verify installation
