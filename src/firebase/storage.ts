import { getStorage } from "firebase/storage";
import { firebaseApp } from "./firebaseApp";

export const storage = getStorage(firebaseApp);
