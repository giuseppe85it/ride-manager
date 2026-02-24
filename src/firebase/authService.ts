import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "./firebaseAuth";

const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(firebaseAuth, provider);
}

export function signOutUser() {
  return signOut(firebaseAuth);
}

export function onUserChanged(callback: (user: import("firebase/auth").User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}
