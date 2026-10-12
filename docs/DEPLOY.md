# Deploying the 3D view and the playground

Checklist for taking `experiment/3d-playground` live. Steps marked **(you)**
need your Vercel or Upstash account; everything else can be checked from the
preview URL.

## 1. Storage for the playground (you)

The playground is one Vercel function, `api/terrariums.ts`, backed by Redis.
Without storage the rest of the site works and the playground says it is not
connected.

- [ ] In the Vercel dashboard, open the project, then **Storage → Create Database
      → Upstash (Redis)**. The free plan is plenty to start.
- [ ] Connect it to this project for **Production and Preview**. This sets
      `KV_REST_API_URL` and `KV_REST_API_TOKEN`. (`UPSTASH_REDIS_REST_URL` and
      `UPSTASH_REDIS_REST_TOKEN` also work if you create the database in Upstash
      directly and add them by hand.)
- [ ] Redeploy the preview after adding the variables. Environment variables
      only reach deployments built after they were set.

Preview and production share one database unless you connect a second one.
Fine for now; test shares from the preview will show up in production's
gallery, so delete them (step 3) before you announce anything.

## 2. Check the API on the preview (the part most likely to break)

The function imports shared TypeScript from `src/playground/`. This has run in
the Vite dev server and in tests, but not yet on Vercel.

Open these in a browser where you are logged in to Vercel (preview deployments
are usually behind Vercel Authentication, so `curl` gets a 401):

- [ ] `https://<preview-url>/api/terrariums` should return `{"items":[],"next":null}`.
  - `503` "not connected to storage": the env vars are missing on Preview, or
    the deploy predates them. Redo step 1.
  - `500` or `FUNCTION_INVOCATION_FAILED`: open **Deployments → the preview →
    Functions → api/terrariums → Logs** and send the error. The likely fix is
    bundling the function's imports.
  - `404`: the function was not deployed; check the build log for `api/`.

## 3. Smoke test on the preview

On desktop:

- [ ] The shelf loads with the example jar, and the drawn jars look right.
- [ ] A jar page shows the 3D jar, with pH, soil air, VPD and daily light under Conditions.
- [ ] Builder: each recipe previews in 3D, the day buttons step through the forecast,
      and **Arrange plants** lets you drag a plant (the forecast updates).
- [ ] Plant a terrarium, then **Share to playground** with a name and note.
      You land on its playground page.
- [ ] Like it (count goes to 1 and stays there on refresh), copy the link and open
      it in a private window, then **Remove from playground** from the original
      browser. It disappears from the gallery.
- [ ] Dark mode: switch the OS theme and check the gallery and a jar page.
- [ ] A jar saved before this branch still opens (the example jar from a previous
      visit counts).

## 4. Phones (you)

The 3D view uses transmissive glass, shadows and a condensation shader. It has
only been tested in headless desktop Chrome.

- [ ] An iPhone (Safari) and a mid-range Android (Chrome): open a jar page and the
      builder. Is it smooth when turning the jar? Does the phone get warm within a minute?
- [ ] Dragging to turn the jar does not trap page scrolling badly.
- [ ] If it stutters: the fix is a lower-quality mode for weak devices (no
      transmission, fewer shadows), not removing the 3D view. Note the device.

## 5. Before strangers can post (you decide)

What is in place: sharing needs a username; usernames, jar names and notes pass
a word filter (`src/playground/moderation.ts`, extend its lists as needed) and are
length-limited; 5 new usernames per hour per IP; 6 shares per hour per keeper;
one like per visitor; anything reported by 3 people is hidden; only a jar's keeper
can remove it.

- [ ] Know how to remove a jar by hand: in the Upstash console, remove its ID from
      the `tr:recent`, `tr:liked` and `tr:by:<username>` sorted sets (the ID is the
      last part of the jar's URL).
- [ ] Know how to retire a username: delete `tr:keeper:<username>`. Its jars stay
      until removed as above; the name becomes free to claim again.
- [ ] Lost recovery codes cannot be reset. If someone proves a name is theirs another
      way, delete `tr:keeper:<username>` and let them claim it again.

## 6. Merge and check production

- [ ] Merge the PR. Vercel deploys `master` to production.
- [ ] Repeat step 2 on the production URL (no login needed there).
- [ ] Share one jar from production, check it appears, then remove it.

## Rolling back

- Fastest: in Vercel, **Deployments → previous production deploy → Instant
  Rollback**.
- Or revert the merge commit on `master` and push.

Saved jars live in each visitor's browser and are unaffected either way: the
new soil and placement data are optional, so an older build simply ignores them.
