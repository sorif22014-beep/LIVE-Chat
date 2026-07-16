import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where
} from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0180708957",
  appId: "1:234167310880:web:146de9c077ed4cbc157a45",
  apiKey: "AIzaSyBKQuNjMKPpPpnZFmqtKAhnWZ0SUi6zNp4",
  authDomain: "gen-lang-client-0180708957.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-voicegroupchat-1809c84a-55a4-49a8-86ee-ffd5aefcd593",
  storageBucket: "gen-lang-client-0180708957.firebasestorage.app",
  messagingSenderId: "234167310880",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where
};
export type { FirebaseUser };
