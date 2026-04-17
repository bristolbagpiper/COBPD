export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

export const firebaseCollections = {
  members: "members",
  gigs: "gigs",
  responses: "responses",
};

export const firebaseEnabled = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim() && value !== "REPLACE_ME",
);
