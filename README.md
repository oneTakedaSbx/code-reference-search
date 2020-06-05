# Code Reference Search

This is a quick script to use GitHub's v3 API to do a code search for specific code in multiple GitHub organizations.

In your env have a personal access token stored in: `GITHUB_CREDENTIALS_PSW`

Then customize `search.json` with your search terms (code) and organizations.  If no organizations are provided it will do a generic code search without an org.

Then run: `npx ts-node github.ts` or `npm start` and results will be in `output.json`.
