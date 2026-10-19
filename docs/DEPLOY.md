# Deploying and running the site

The site is static (Vite, `dist/`) plus one Vercel function, `api/shelf.ts`, for the
community shelf. Jars live in each visitor's browser; only shared jars, usernames,
likes and follows are on the server, in Redis.

## Setting up

1. **Project.** Import the repo in Vercel. `vercel.json` sets the build, routes
   `/api/terrariums`, `/api/keepers` and `/s/ID` to the one function, and caches the
   hashed files in `/assets/` for a year.
2. **Database.** In the project's **Storage** tab, create a Redis database (Redis, or
   Upstash for Redis; the free plan is plenty) and connect it to **Production** (and
   Preview, if you want the shelf on previews). Then **redeploy**: environment
   variables only reach deployments built after they were set.
   - The app looks for `REDIS_URL` or `KV_URL` (any prefix), or Upstash's REST pair
     (`KV_REST_API_URL`/`_TOKEN`, `UPSTASH_REDIS_REST_URL`/`_TOKEN`), which it turns into
     a `rediss://` address. One function means one connection per running instance;
     Redis Cloud's free plan allows about 30.
   - Preview and production share the database unless you connect a second one.
3. **Analytics (optional).** In the project, open **Analytics** and enable Web
   Analytics. The app reports page views itself (its pages live after a `#`), grouped
   by kind of page with ids and names left out: `/`, `/new`, `/jar/[id]`,
   `/community`, `/community/[id]`, `/u/[name]`, `/keeper`. No cookies.
4. **Moderators (optional).** Claim your username on the site first, then add
   `MODERATORS` (comma-separated usernames) for Production and redeploy. Moderators
   see **Remove (moderator)** on any shared jar and **Ban** on keepers' shelves. A
   listed name cannot be claimed and a moderator cannot delete their account, so
   nobody can take a moderator's name; list a name only once it is yours.

## Checking it works

- `curl https://<site>/api/terrariums?sort=recent` returns `{"items":[...],"next":...}`.
  A `503` means no storage: its `setup` field names the storage variables the
  deployment has (names only, never values) and what is missing.
- `curl https://<site>/s/anything` returns a small HTML page (with the jar's preview
  tags when the id exists).
- In a browser: claim a test name, share a jar, like it, open its `/s/` link, then
  delete the test account from the account page (its jars go with it).

Preview deployments sit behind Vercel's login, so `curl` gets a 401 there; check
previews in a logged-in browser, or locally.

## Locally

`npm run dev` runs the same API inside Vite, with an in-memory shelf seeded with a few
example keepers and jars. Put `REDIS_URL` (and `MODERATORS`) in `.env` to use a real
database. The store tests also run against a real Redis when given one:

```bash
redis-server --port 6390 --save '' --daemonize yes
REDIS_TEST_URL=redis://localhost:6390 npx vitest run test/playground.test.ts
```

(The database at that address is emptied.)

## Looking after the shelf

What is automatic: sharing needs a username; usernames, jar names, notes and journal
lines pass a word filter (`src/playground/moderation.ts`, extend its lists as needed);
5 new usernames per hour per connection, 6 shares per hour per keeper, 3 likes per
connection per jar a day; a jar reported from three different connections is hidden.

By hand, in the database's console or `redis-cli` (keys start `tr:`):

| To | Do |
|---|---|
| Remove a jar | As a moderator, **Remove (moderator)** on its page. Or remove its id from `tr:recent`, `tr:liked` and `tr:by:<username>`, and delete `tr:item:<id>`. The id is the last part of its URL. |
| Retire a username | As a moderator, **Ban** on its shelf (jars go, name stays taken). Or delete `tr:keeper:<username>` and remove its jars as above (name becomes free). |
| Unhide a reported jar | `ZADD tr:recent <createdAt> <id>`, `ZADD tr:liked <likes> <id>`, `ZADD tr:by:<username> <createdAt> <id>`, and `DEL tr:reports:<id>`. |
| Help someone who lost their recovery code | Codes cannot be reset. If they prove the name is theirs another way, delete `tr:keeper:<username>` and let them claim it again. |

Other keys: `tr:card:<id>` (the link-preview picture), `tr:voters:<id>`,
`tr:following:<name>` and `tr:followers:<name>` (sets), `tr:rl:*` (rate limits, expire
on their own).

## When something breaks

- **Shelf says it is not connected:** see the `503` above; usually the database is not
  connected to Production, or the deploy predates it.
- **"Could not reach the community shelf":** the function could not connect to Redis.
  **Deployments → the deployment → Functions → api/shelf → Logs** has the error. It
  reconnects on the next request.
- **A bad deploy:** **Deployments → the previous production deploy → Instant Rollback**,
  or revert the merge commit on `master` and push.

Saved jars live in visitors' browsers and survive rollbacks: newer fields (placement of
wood and stone, plant positions, frames) are optional, so an older build ignores them.
