---
name: appsec-owasp-crypto
description: Cybersécurité applicative avancée 2026. OWASP Top 10, Content Security Policy (CSP) stricte, chiffrement AES-GCM 256 au repos, protection XSS/CSRF, sanitization des uploads et gestion étanche des secrets.
---

# Advanced Application Security (AppSec) & Cryptography (2026 Edition)

Ce skill transforme chaque composant et route d'API en une forteresse imprenable contre les attaques cybernétiques modernes.

## 1. Défense Contre l'OWASP Top 10 (2026)

1. **Injection SQL & NoSQL** :
   - Strict usage des requêtes paramétrées via Prisma ORM.
   - Interdiction totale des requêtes brutes concaténées (`$queryRawUnsafe` formellement proscrit sans validation Zod et typage).
2. **Cross-Site Scripting (XSS)** :
   - Ne jamais injecter de HTML arbitraire via `dangerouslySetInnerHTML` sans passer par un sanitizer strict (`DOMPurify`).
   - Mise en place d'une en-tête `Content-Security-Policy` stricte bloquant l'exécution de scripts tiers non autorisés.
3. **Cross-Site Request Forgery (CSRF)** :
   - Cookies de session configurés avec : `HttpOnly`, `SameSite=Lax` ou `Strict`, et `Secure` (HTTPS uniquement).

---

## 2. Cryptographie & Protection des Données Sensibles

- **Chiffrement au Repos (At-Rest)** :
  - Les photos de peau, dossiers dermatologiques et pièces d'identité doivent être chiffrés avec **AES-256-GCM** avec vecteur d'initialisation (IV) unique généré par transaction.
- **Mots de Passe & Clés de Sécurité** :
  - Hachage obligatoire via **Argon2id** (ou Scrypt/Bcrypt avec salt unique et cost factor élevé).
  - Rotation automatisée des clés d'API et secrets webhook.

---

## 3. Sécurité des Uploads de Fichiers (Images de Peau)

- Valider le **Magic Number (vrais octets du fichier)**, et pas seulement l'extension `.jpg` ou `.png`.
- Re-compresser et strip les métadonnées EXIF (qui contiennent la géolocalisation GPS et le modèle du smartphone du client) via Sharp ou WebP avant stockage.
