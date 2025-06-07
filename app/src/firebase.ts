import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore"; // ADICIONADO para Firestore

// TODO: Substitua pelas suas credenciais do Firebase
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
console.log("🚀 ~ firebaseConfig:", firebaseConfig);

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app); // ADICIONADO para Firestore

export { firestore };
