const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const firebaseConfigured = Object.values(firebaseConfig).every(
  value => value && !value.startsWith("YOUR_")
);

window.firebaseApp = null;
window.firebaseAuth = null;
window.firebaseDb = null;

if (firebaseConfigured) {
  if (!window.firebase) {
    throw new Error("Firebase SDK failed to load. Check your internet connection.");
  }

  window.firebaseApp = firebase.initializeApp(firebaseConfig);
  window.firebaseAuth = firebase.auth();
  window.firebaseDb = firebase.firestore();
}
