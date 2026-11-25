# Posting a release

Everything below runs from this folder.

1. Check that everything still works:

   ```sh
   node --test
   node build.mjs
   ```

   All tests should pass. The converter tests need Google Chrome installed.

2. Commit and push:

   ```sh
   git add .
   git commit -m "what changed"
   git push
   ```

   GitHub Pages picks up the push on its own, at https://sh1lll.github.io/offline-office-ai/.

3. Make a release with the next version number, and attach the single file. `dist/` isn't in git, so
   the release is how people get it:

   ```sh
   cp dist/offline-office.html dist/offline-office-ai.html
   gh release create v1.1.0 dist/offline-office-ai.html --title "Offline Office AI 1.1" --notes "what changed"
   ```

4. Open the Pages link and the downloaded file once each, and drop a PDF in to check it works.

## Pulling in updates from Offline Office

This repository is a fork. To bring in changes made to the main app:

```sh
git fetch upstream
git merge upstream/main
node --test
```
