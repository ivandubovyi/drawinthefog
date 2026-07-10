# Fix the 404 + deploy Airpost

## Why you got 404

GitHub Pages was probably serving **source files** (or nothing), not the built website.  
Vite apps must be **built** first. This folder now includes a ready `docs/` site.

---

## Do this (simplest fix)

### 1. On GitHub → your repo → Settings → Pages

1. **Source**: Deploy from a **branch** (not GitHub Actions)
2. **Branch**: `main`
3. **Folder**: `/docs`
4. Click **Save**

### 2. Make sure `docs/` is in the repo

Your Desktop folder already has `docs/`. Re-upload / push so GitHub has these files:

```
docs/index.html
docs/404.html
docs/favicon.svg
docs/assets/...
```

If you uploaded earlier **without** `docs/`, upload the whole `airpost-deploy` folder again (still under 100 files).

### 3. Wait 1–2 minutes, then open the right URL

```
https://YOUR_USERNAME.github.io/REPO_NAME/
```

Examples:
- repo named `airpost` → `https://yourname.github.io/airpost/`
- repo named `airpost-deploy` → `https://yourname.github.io/airpost-deploy/`

**Wrong URLs that 404:**
- `https://yourname.github.io/` (missing repo name)
- `https://github.com/yourname/airpost` (that’s the code page, not the live site)

Hard-refresh: Cmd+Shift+R

---

## Checklist if it still 404s

1. Repo is **public**
2. Pages shows a green check / “Your site is live at …”
3. You can open `https://YOUR_USERNAME.github.io/REPO_NAME/index.html`
4. In the repo file browser, you can see the `docs` folder with `index.html` inside

---

## Optional: GitHub Actions later

There’s still a `.github/workflows/deploy.yml` if you want auto-build on push.  
For now, **branch → /docs** is the reliable fix.
