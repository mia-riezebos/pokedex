import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

// Separate Firebase app instance for server-side (Node runtime) usage.
// The client init at `firebase.ts` uses persistentLocalCache which requires
// IndexedDB and does not work in Node — this one uses in-memory cache so it
// can run inside opengraph-image.tsx / route handlers.
const SERVER_APP_NAME = "recipes-server";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app =
  getApps().find((a) => a.name === SERVER_APP_NAME) ??
  initializeApp(firebaseConfig, SERVER_APP_NAME);

export const serverDb = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
