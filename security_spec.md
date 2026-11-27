# VoiceLab AI Studio — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **User Isolation & PII Protection**: A user document at `/users/{userId}` may only be read or updated by `request.auth.uid == userId` or a verified admin (`isAdmin()`). Unverified emails cannot write data.
2. **Self-Elevation Prevention**: Users cannot assign themselves admin status, upgrade their subscription `plan`, unsuspend themselves, or grant themselves positive credits. Initial user signup strictly enforces `plan == 'free'`, `credits == 1000`, `suspended == false`.
3. **Unlimited Free Voice Cloning**: Voice cloning profiles at `/voiceProfiles/{voiceId}` never require credit deductions, always mandate `consentConfirmed == true` and `ownerId == request.auth.uid` on creation, and cannot be reassigned to another owner.
4. **Immutable Consent Trail**: `/consentRecords/{recordId}` cannot be updated once created (`allow update: if false`).
5. **Query Security**: All `allow list` rules on user-owned collections explicitly evaluate `resource.data.ownerId == request.auth.uid` (or `reporterId == request.auth.uid`), never delegating filtering solely to the client.
6. **Zero Secret Exposure**: No API keys or private credentials exist in `/aiEngines` or `/appSettings`; only admin-verified identities can mutate `/voiceLibrary`, `/appSettings`, and `/aiEngines`.

## 2. The "Dirty Dozen" Adversarial Test Payloads
1. **Self-Admin Escalation**: Creating `/users/attacker` with `plan: "studio"`, `credits: 999999` -> **MUST FAIL** (`PERMISSION_DENIED`).
2. **Credit Inflation Update**: Updating `/users/uid1` to increment `credits` from `1000` to `5000` as non-admin -> **MUST FAIL**.
3. **Shadow Ghost Field**: Updating `/voiceProfiles/v1` with `{ name: "My Voice", isAdminApproved: true }` -> **MUST FAIL** (`hasOnly` check).
4. **Unverified Email Spoof**: Request with `token.email == "polashnxbd@gmail.com"` and `token.email_verified == false` calling admin route -> **MUST FAIL**.
5. **Cross-User PII Read**: Authenticated `uid2` calling `get(/users/uid1)` -> **MUST FAIL**.
6. **Blanket List Scrape**: Authenticated `uid2` calling `list(/voiceProfiles)` without owner filter -> **MUST FAIL**.
7. **Consent Bypass**: Creating `/voiceProfiles/v2` with `consentConfirmed: false` -> **MUST FAIL**.
8. **Ownership Hijack**: Creating `/voiceProfiles/v3` with `ownerId: "someone_else"` -> **MUST FAIL**.
9. **Consent Tampering**: Updating `/consentRecords/c1` after creation -> **MUST FAIL**.
10. **ID Poisoning**: Creating `/voiceProfiles/<2000-char string>` -> **MUST FAIL** (`isValidId` regex & length check).
11. **Timestamp Forgery**: Creating `/audioGenerations/g1` with backdated `createdAt` (`!= request.time`) -> **MUST FAIL**.
12. **Unauthorized Library Mutation**: Non-admin creating or deleting `/voiceLibrary/lib1` -> **MUST FAIL**.
