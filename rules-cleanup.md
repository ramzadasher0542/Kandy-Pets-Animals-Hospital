# \# REPO CLEANUP — Before Vercel Deploy

# 

# \## WHAT TO DO

# 

# \### 1. Move remaining root .cjs files to tools/

# Move these files from root to tools/ folder:

# \- pw-test.cjs

# \- screenshot-panels.cjs

# \- take\_screenshots.cjs

# \- test-dashboard.cjs

# 

# \### 2. Remove unused dependencies from package.json

# Remove these from "dependencies":

# \- "express": "^4.21.2" (this is a frontend Vite app, no Express server)

# \- "@types/express": "^4.17.21" (move to devDependencies or remove)

# \- "pdf-parse": "^2.4.5" (not used in any component)

# \- "dotenv": "^17.2.3" (Vite uses import.meta.env)

# \- "@google/genai": "^1.29.0" (not used in src/)

# 

# Remove "vite" from "dependencies" (it's already in devDependencies).

# 

# \### 3. Add .gitignore

# Create .gitignore with:

# .env

# .env.local

# dist/

# node\_modules/

# .DS\_Store

# \*.log

# 

# \### 4. Clean up src/ imports

# Search for any unused imports in src/ and remove them.

# 

# \## CONSTRAINTS

# 1\. DO NOT remove any used dependencies

# 2\. DO NOT change src/ logic — only remove unused imports

# 3\. Run npm install after package.json changes

# 4\. Run npx tsc --noEmit after

