# Deploy Airpost (GitHub Pages)

Your deployable project is this folder: **`~/Desktop/airpost-deploy`**

Camera access requires **HTTPS**. GitHub Pages gives you that for free.

---

## Steps

### 1. Create a GitHub repo

1. Go to [https://github.com/new](https://github.com/new)
2. Name it something like `airpost` (public)
3. **Do not** add a README / .gitignore / license (this folder already has them)
4. Create the repository

### 2. Push this folder

Open Terminal and run (replace `YOUR_USERNAME` with your GitHub username):

```bash
cd ~/Desktop/airpost-deploy
git init
git add .
git commit -m "Initial Airpost commit for Hack the Arts"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/airpost.git
git push -u origin main
```

If GitHub asks you to sign in, use the browser / Personal Access Token / `gh auth login`.

### 3. Turn on GitHub Pages

1. Open your repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**
3. Go to the **Actions** tab → open **Deploy to GitHub Pages** → wait until it’s green

### 4. Open your live site

Your site will be at:

```
https://YOUR_USERNAME.github.io/airpost/
```

(If the repo is named differently, use that name in the URL.)

---

## After you change code

```bash
cd ~/Desktop/airpost-deploy
git add .
git commit -m "Update Airpost"
git push
```

GitHub Actions rebuilds and redeploys automatically.

---

## Devpost checklist

- [ ] Live demo link (the GitHub Pages URL above)
- [ ] Public GitHub repo (this one)
- [ ] Project description (use the README)
- [ ] Short demo video (screen record: enter fog → draw → unveil → post → guess on wall)
- [ ] Note: camera permission required; Chrome recommended

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page on Pages | Wait for Actions to finish; hard-refresh. `base: './'` is already set. |
| Camera blocked | Must be HTTPS (Pages is). Allow camera in the browser prompt. |
| Actions failing | Check **Actions** logs; usually `npm ci` / Node version. |
| Repo is private | Pages on free accounts needs a **public** repo (or GitHub Pro). |

---

## Optional: deploy with one click elsewhere

- **Vercel**: Import the GitHub repo → Framework Vite → Deploy  
- **Netlify**: Import repo → build `npm run build` → publish `dist`
