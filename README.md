# lava
vibes

## setup - how to run w bun

```bash
bun install
bun run build
bunx serve 
```

## github pages

1. go to repo settings > pages
2. set source to "github actions"
3. push to main - it will auto-deploy

the workflow builds the project and deploys the `dist/` folder along with all assets.
