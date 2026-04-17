export const firebaseConfig = {
  apiKey: "AIzaSyBXG43rdBKgrUHAMFJQOuZAo7w1LbGaQM4",
  authDomain: "cobpd-3bf88.firebaseapp.com",
  projectId: "cobpd-3bf88",
  storageBucket: "cobpd-3bf88.firebasestorage.app",
  messagingSenderId: "778991988490",
  appId: "1:778991988490:web:910da362d4793b8ec494f3"
};

export const firebaseCollections = {
  members: "members",
  gigs: "gigs",
  responses: "responses",
};

export const firebaseEnabled = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim() && value !== "REPLACE_ME",
);
