import { initializeApp } from "firebase/app";

function requireEnv(name: string): string {
  const value = import.meta.env[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const message = `[Firebase] Missing required env var: ${name}. Set it in .env.local`;
  console.error(message);
  throw new Error(message);
}

const firebaseConfig = {
  apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("VITE_FIREBASE_APP_ID"),
};

export const firebaseApp = initializeApp(firebaseConfig);
