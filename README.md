# Outlet performance dashboard

A single-page dashboard showing weekly sales against target for the Jurong, Orchard
and Tampines outlets. It reads the `Combined` tab of a Google Sheet through the Google
Sheets API v4 and renders everything in the browser.

No framework and no build step. `index.html` is the whole app; `middleware.js` puts a
username and password in front of it.

## What it shows

- Four KPI cards: total sales, % of target, orders, returns %.
- An outlet filter (All, plus one button per outlet) that updates every panel.
- A bar per outlet-week showing sales as % of target, red below 90%, with a dashed
  line at the 90% mark. The chart scrolls sideways on a phone.
- A "Needs attention" list of outlet-weeks under 90% of target, worst first.

Light and dark mode both follow the device setting.

## Setup

The dashboard needs a Google API key before it can read the sheet. Without one it falls
back to a snapshot of the data bundled in the file and shows a red banner saying so.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and pick or create
   a project.
2. **APIs & Services → Library**, search "Google Sheets API", click **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Restrict the key straight away: open it, set **Application restrictions → Websites**
   to your Vercel domain (add `http://localhost:*` while testing), and set
   **API restrictions** to Google Sheets API only.
5. Put the key in `CONFIG.API_KEY` near the top of the script in `index.html`.

The sheet also has to stay shared as **Anyone with the link can view**. An API key can
only read sheets that are already public.

### A note on the key, because this repo is public

Anything committed here is visible to everyone, and a static page has no server to hide
a key behind, so the key ends up in the page source either way. Two ways to handle it:

- **Restrict the key** as in step 4 above and accept that it is public. The risk is
  low, since a restricted key grants nothing but read access to a sheet that is already
  public. Be aware that GitHub and Google both scan public repos for keys, and Google
  may disable a key it finds this way.
- **Keep the key off the repo entirely** by reading the sheet through a small Vercel
  serverless function, with the key stored as a Vercel environment variable. This needs
  one extra file and still no build step. Worth doing if the key is ever reused for
  anything else.

## Deploying to Vercel

1. In Vercel, **Add New → Project**, and import `samangms/Sales-Drive`.
2. Leave the framework preset as **Other**. There is no build command and no output
   directory to set.
3. Deploy.

Vercel serves `index.html` at the root. Every push to `main` redeploys automatically.
Vercel installs `@vercel/functions` for the middleware, but there is still no build
command to configure.

Once you know the domain, go back to the API key in Google Cloud Console and add that
domain under **Application restrictions → Websites**, or the key will be refused.

## Password protection

`middleware.js` sits in front of every request and asks for a username and password
using HTTP Basic Auth, so the browser shows its own sign-in prompt before the dashboard
loads. It runs on Vercel's Routing Middleware, on the Node.js runtime.

Set both of these in **Project → Settings → Environment Variables**, for every
environment you want protected (Production, Preview, Development), then redeploy:

| Variable | Value |
| --- | --- |
| `DASHBOARD_USER` | The username people type at the prompt. |
| `DASHBOARD_PASSWORD` | The password. |

Until both are set, every request gets a 503 saying the dashboard isn't configured. It
fails closed on purpose, so a missing variable can never leave the dashboard public.

Check it from a terminal once deployed. The first should be `401`, the second `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://YOUR-DOMAIN.vercel.app/
curl -s -o /dev/null -w '%{http_code}\n' -u 'USER:PASSWORD' https://YOUR-DOMAIN.vercel.app/
```

Worth knowing about Basic Auth:

- Credentials are base64 encoded, not encrypted. That is fine here because Vercel serves
  everything over HTTPS, but never put this behind a plain `http://` origin.
- There is one shared username and password, so there is no per-person access or audit
  trail. For that you would want Vercel's own authentication or an SSO provider.
- Browsers hold on to the credentials for the rest of the session and offer no sign-out.
  Closing the browser clears them. Changing the password in Vercel and redeploying
  forces everyone to re-enter it.
- The password check compares SHA-256 digests rather than the raw strings, so the
  comparison takes the same time whether the password is wrong at the first character
  or the last.

## Configuration

Everything configurable sits in the `CONFIG` block at the top of the script.

| Setting | What it does |
| --- | --- |
| `SHEET_URL` | The Google Sheet to read. The spreadsheet ID is taken from this link. |
| `API_KEY` | Google API key. The primary data source. |
| `PUBLISHED_CSV_URL` | Optional fallback, used only if the API call fails. Needs the tab published via File → Share → Publish to web → CSV. |
| `TAB_NAME` | Tab to read. Defaults to `Combined`. |
| `THRESHOLD` | The red line. Defaults to `0.9`, meaning 90% of target. |
| `CURRENCY_SYMBOL` | Defaults to `$`. |
| `USE_SNAPSHOT` | Whether to fall back to the bundled snapshot when the sheet can't be read. Set to `false` to show an error instead. |

## Expected sheet layout

The `Combined` tab needs these columns, named exactly this in row 1. Order doesn't
matter and extra columns are ignored.

| outlet | week | sales | target | orders | returns |
| --- | --- | --- | --- | --- | --- |
| Jurong | 2026-08-17 | 15500 | 15000 | 519 | 16 |

## If it won't load

The page names the actual cause rather than giving one generic message, so read the
text under "Couldn't load the sales data" or in the red banner. The common ones:

| What it says | What to do |
| --- | --- |
| Open as a local file | Browsers block data requests from `file://` pages. Deploy it, or serve the folder over `http://localhost`. |
| API key rejected | Check `CONFIG.API_KEY` for a typo and that the key is still active. |
| Sheets API not switched on | Enable the Google Sheets API for that key's project, then wait a minute. |
| Key restricted to other websites | Add this domain under Application restrictions → Websites. |
| Google refused this sheet | Check the sheet is shared as Anyone with the link can view. |
| Tab not found | Check `TAB_NAME` and `SHEET_URL`. |

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole dashboard. |
| `middleware.js` | HTTP Basic Auth in front of every request. |
| `package.json` | Declares `@vercel/functions`, which the middleware imports, and sets `"type": "module"`. Vercel requires one or the other for a project with no framework. |
| `package-lock.json` | Pins the dependency version so deploys are reproducible. |
| `vercel.json` | Stops the HTML being cached, so a redeploy shows up immediately. |
| `.gitignore` | Keeps `node_modules`, `.vercel` and local env files out of the repo. |

## If the password prompt never appears

| Symptom | Likely cause |
| --- | --- |
| The dashboard loads with no prompt | The middleware didn't deploy. Check the deployment's build log for `middleware.js`, and that `package.json` is in the repo root next to it. |
| Every request returns 503 | `DASHBOARD_USER` or `DASHBOARD_PASSWORD` is missing for that environment. Set both and redeploy. |
| The prompt reappears after a correct password | A trailing space in the environment variable value is the usual culprit. |
