import { db } from "./firestore";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { firebaseAuth } from "./firebaseAuth";

function requireUser() {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("User not authenticated");
  return user.uid;
}

export function userCollection(name: string) {
  const uid = requireUser();
  return collection(db, "users", uid, name);
}

export function userDoc(collectionName: string, docId: string) {
  const uid = requireUser();
  return doc(db, "users", uid, collectionName, docId);
}

export async function setUserDoc(collectionName: string, docId: string, data: any) {
  const ref = userDoc(collectionName, docId);
  await setDoc(ref, data);
}

export async function setUserDocMerge(collectionName: string, docId: string, data: any) {
  const ref = userDoc(collectionName, docId);
  await setDoc(ref, data, { merge: true });
}

export async function deleteUserDoc(collectionName: string, docId: string) {
  const ref = userDoc(collectionName, docId);
  await deleteDoc(ref);
}

export async function getUserDoc(collectionName: string, docId: string) {
  const ref = userDoc(collectionName, docId);
  return getDoc(ref);
}

export async function getUserCollection(collectionName: string) {
  const ref = userCollection(collectionName);
  return getDocs(ref);
}
