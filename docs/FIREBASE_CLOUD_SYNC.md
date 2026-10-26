# Firebase Cloud Sync - Phase 1 Setup

This phase adds Google Authentication and a Firestore read/write connectivity test.
It does not yet upload or merge Lunar Sim routes.

## Firebase Console

1. Create a Firebase project.
2. Add a Web app.
3. Authentication > Sign-in method: enable Google.
4. Firestore Database: create the database in Production mode.
5. Firestore Rules: replace the rules with the repository's `firestore.rules` and publish.
6. Authentication > Settings > Authorized domains: add every production hostname that serves Lunar Sim.

## Local environment

Copy `.env.example` to `.env.local` and fill the Firebase web configuration.

Restart `npm run dev` after changing environment variables.

## Verification

1. Open Lunar Sim.
2. The top account control should show Google Sign In instead of Cloud Off.
3. Sign in with a Google account.
4. Click Sync Test.
5. Firestore should contain `users/{uid}/diagnostics/connection`.
6. Sign out, sign in on another device, and repeat the test.

## Phase 2

After Phase 1 is confirmed:
- keep localStorage as offline local state;
- migrate routes into route/session records and chunks;
- merge POI/completion sets by union;
- queue and retry cloud writes;
- use revisions/tombstones for deletions.
