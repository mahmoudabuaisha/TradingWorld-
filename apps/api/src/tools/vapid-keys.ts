/** Prints a fresh VAPID key pair for Web Push: node apps/api/dist/tools/vapid-keys.js — store them as secrets. */
import webpush from "web-push";
const k = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:alerts@your-domain.example`);
