// Verbs Quest — SpacetimeDB Rust module
//
// Schema mirrors the original Supabase schema (verbs, users, game_sessions,
// app_settings) plus the procedural RPC logic (submit_level_attempt, admin
// overview, category switching, settings updates). Auth is identity-based:
// each connection's `ctx.sender()` is the canonical user identifier. Usernames
// are unique globally; passwords are stored as argon2 hashes for forward
// compatibility (cross-device login via login_user reducer).

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::RngCore;
use spacetimedb::{
    procedure, reducer, table, Identity, JwtClaims, ProcedureContext, ReducerContext,
    SpacetimeType, Table, Timestamp,
};

// ─────────────────────────────────────────────────────────────────────────────
// Password hashing helpers
//
// SpacetimeDB disallows `getrandom` (the default randomness source for `rand`)
// in module code. We instead pull bytes from `ctx.rng()` (which is exposed by
// the runtime as deterministic-per-reducer randomness), hex-encode them into
// the salt string, and feed them to argon2.
// ─────────────────────────────────────────────────────────────────────────────

fn hash_password_with_rng<R: RngCore>(
    rng: &mut R,
    password: &str,
) -> Result<String, String> {
    let mut salt_bytes = [0u8; 16];
    rng.fill_bytes(&mut salt_bytes);
    let salt_str = hex::encode(salt_bytes);
    let salt = SaltString::from_b64(&salt_str).map_err(|e| format!("Invalid salt: {e}"))?;
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {e}"))?
        .to_string();
    Ok(hash)
}

fn verify_password(password: &str, hash: &str) -> bool {
    let parsed = match PasswordHash::new(hash) {
        Ok(p) => p,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

#[table(accessor = user, public)]
pub struct User {
    #[primary_key]
    pub identity: Identity,
    #[unique]
    pub username_lower: String,
    pub username: String,
    pub password_hash: String,
    pub role: String, // "student" | "admin"
    pub current_level_cap: u32,
    pub created_at: Timestamp,
}

#[table(accessor = verb, public)]
pub struct Verb {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub level_group: u32,
    #[index(btree)]
    pub category: u32,
    pub infinitive: String,
    pub past_simple: String,
    pub past_participle: String,
    pub active: bool,
}

#[table(accessor = game_session, public)]
pub struct GameSession {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub user_identity: Identity,
    #[index(btree)]
    pub level_attempted: u32,
    pub errors_count: u32,
    pub duration_seconds: u32,
    pub completed_at: Timestamp,
    pub is_perfect_run: bool,
    pub client_timestamp_start: Timestamp,
    pub client_timestamp_end: Timestamp,
}

#[table(accessor = app_setting, public)]
pub struct AppSetting {
    #[primary_key]
    pub id: u8, // always 1
    pub time_limit_seconds: u32,
    pub verbs_per_level: u32,
    pub active_verb_category: u32,
    pub updated_at: Timestamp,
    pub updated_by: Identity,
}

// ─────────────────────────────────────────────────────────────────────────────
// Return types for procedures
// ─────────────────────────────────────────────────────────────────────────────

#[derive(SpacetimeType, Clone, Debug)]
pub struct UserOverview {
    pub user_identity: String,
    pub username: String,
    pub current_level_cap: u32,
    pub total_runs: u64,
    pub total_perfect_runs: u64,
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct UserLevelDetail {
    pub level_attempted: u32,
    pub total_runs: u64,
    pub perfect_runs: u64,
    pub best_time_seconds: Option<u32>,
    pub global_rank: Option<u64>,
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct LevelRunDetail {
    pub duration_seconds: u32,
    pub is_perfect_run: bool,
    pub completed_at: Timestamp,
    pub errors_count: u32,
    pub client_timestamp_start: Timestamp,
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct LevelVerbDetail {
    pub id: u64,
    pub infinitive: String,
    pub past_simple: String,
    pub past_participle: String,
}

#[derive(SpacetimeType, Clone, Debug)]
pub struct LevelRunsResponse {
    pub runs: Vec<LevelRunDetail>,
    pub verbs: Vec<LevelVerbDetail>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

#[reducer(init)]
pub fn init(ctx: &ReducerContext) {
    // Seed the singleton app_setting row if missing.
    if ctx.db.app_setting().id().find(1).is_none() {
        ctx.db.app_setting().insert(AppSetting {
            id: 1,
            time_limit_seconds: 180,
            verbs_per_level: 5,
            active_verb_category: 1,
            updated_at: ctx.timestamp,
            updated_by: ctx.sender(),
        });
    }
}

#[reducer(client_connected)]
pub fn on_connect(_ctx: &ReducerContext) {}

#[reducer(client_disconnected)]
pub fn on_disconnect(_ctx: &ReducerContext) {}

// ─────────────────────────────────────────────────────────────────────────────
// Auth / Registration
// ─────────────────────────────────────────────────────────────────────────────

const USERNAME_MIN: usize = 3;
const USERNAME_MAX: usize = 12;
const PASSWORD_MIN: usize = 6;

fn is_valid_username(s: &str) -> bool {
    !s.is_empty()
        && s.len() >= USERNAME_MIN
        && s.len() <= USERNAME_MAX
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[reducer]
pub fn register_user(
    ctx: &ReducerContext,
    username: String,
    password: String,
) -> Result<(), String> {
    if ctx.db.user().identity().find(ctx.sender()).is_some() {
        return Err("Profile already exists for this identity".into());
    }

    if !is_valid_username(&username) {
        return Err(format!(
            "Username must be {}-{} chars, alphanumeric or underscore",
            USERNAME_MIN, USERNAME_MAX
        ));
    }
    if password.len() < PASSWORD_MIN {
        return Err(format!("Password must be at least {} characters", PASSWORD_MIN));
    }

    let lower = username.to_lowercase();
    if ctx.db.user().username_lower().find(&lower).is_some() {
        return Err("Username is already taken".into());
    }

    let mut rng = ctx.rng();
    let hash = hash_password_with_rng(&mut rng, &password)?;
    ctx.db.user().insert(User {
        identity: ctx.sender(),
        username_lower: lower,
        username,
        password_hash: hash,
        role: "student".into(),
        current_level_cap: 1,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn login_user(
    ctx: &ReducerContext,
    username: String,
    password: String,
) -> Result<(), String> {
    if ctx.db.user().identity().find(ctx.sender()).is_some() {
        return Err("This device already has a profile. Sign out first.".into());
    }

    let lower = username.to_lowercase();
    let existing = ctx
        .db
        .user()
        .username_lower()
        .find(&lower)
        .ok_or_else(|| "Username not found".to_string())?;

    if !verify_password(&password, &existing.password_hash) {
        return Err("Invalid password".into());
    }

    migrate_user_to_identity(ctx, existing, ctx.sender())
}

fn migrate_user_to_identity(
    ctx: &ReducerContext,
    mut user: User,
    new_identity: Identity,
) -> Result<(), String> {
    let old_identity = user.identity;
    if old_identity == new_identity {
        return Ok(());
    }

    let sessions: Vec<GameSession> = ctx
        .db
        .game_session()
        .iter()
        .filter(|session| session.user_identity == old_identity)
        .collect();

    for session in sessions {
        ctx.db.game_session().id().update(GameSession {
            user_identity: new_identity,
            ..session
        });
    }

    if let Some(attempt) = ctx.db.user_attempt().identity().find(old_identity) {
        ctx.db.user_attempt().identity().delete(old_identity);
        ctx.db.user_attempt().insert(UserAttempt {
            identity: new_identity,
            last_status: attempt.last_status,
            last_new_level: attempt.last_new_level,
            last_completed_at: attempt.last_completed_at,
        });
    }

    ctx.db.user().identity().delete(old_identity);
    user.identity = new_identity;
    ctx.db.user().insert(user);
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Google (OIDC) sign-in
//
// SpacetimeDB accepts any OpenID-Connect compliant JWT and derives the user's
// `Identity` from the token's `iss` + `sub` claims. That means a Google account
// maps to ONE stable identity across every device/browser — no password needed.
//
// `GOOGLE_CLIENT_ID` MUST be replaced with your real OAuth 2.0 Web client ID
// (from Google Cloud Console) BEFORE publishing if you want Google sign-in to
// work. It is a *public* value (not a secret), so it is fine to commit. The
// audience (`aud`) check guarantees a token minted for some *other* app cannot
// be replayed against this module.
// ─────────────────────────────────────────────────────────────────────────────

const GOOGLE_ISSUER: &str = "https://accounts.google.com";
const GOOGLE_ISSUER_ALT: &str = "accounts.google.com";
const GOOGLE_CLIENT_ID: &str =
    "573552267813-msjua9asdqcqbrgdhjopb13ekb4tu5nh.apps.googleusercontent.com";

fn validate_google_claims(jwt: &JwtClaims, expected_client_id: &str) -> Result<(), String> {
    let iss = jwt.issuer();
    if iss != GOOGLE_ISSUER && iss != GOOGLE_ISSUER_ALT {
        return Err(format!("Untrusted token issuer: {iss}"));
    }
    if !jwt.audience().iter().any(|aud| aud == expected_client_id) {
        return Err("Token audience does not match this application".into());
    }
    Ok(())
}

#[reducer]
pub fn register_google_user(ctx: &ReducerContext, username: String) -> Result<(), String> {
    if GOOGLE_CLIENT_ID.starts_with("REPLACE_WITH_") {
        return Err(
            "Google sign-in is not configured on the server (set GOOGLE_CLIENT_ID).".into(),
        );
    }

    let jwt = ctx
        .sender_auth()
        .jwt()
        .ok_or_else(|| "Google sign-in requires an OIDC token".to_string())?;
    validate_google_claims(jwt, GOOGLE_CLIENT_ID)?;

    if ctx.db.user().identity().find(ctx.sender()).is_some() {
        return Err("Profile already exists for this identity".into());
    }
    if !is_valid_username(&username) {
        return Err(format!(
            "Username must be {}-{} chars, alphanumeric or underscore",
            USERNAME_MIN, USERNAME_MAX
        ));
    }

    let lower = username.to_lowercase();
    if ctx.db.user().username_lower().find(&lower).is_some() {
        return Err("Username is already taken".into());
    }

    // Google handles authentication, so no password is stored for these users.
    ctx.db.user().insert(User {
        identity: ctx.sender(),
        username_lower: lower,
        username,
        password_hash: String::new(),
        role: "student".into(),
        current_level_cap: 1,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn register_admin(
    ctx: &ReducerContext,
    username: String,
    password: String,
) -> Result<(), String> {
    if ctx.db.user().identity().find(ctx.sender()).is_some() {
        return Err("Profile already exists for this identity".into());
    }
    // Admin registration is allowed only when no admin exists yet, to avoid
    // privilege escalation. After that, promote via promote_to_admin reducer.
    if ctx.db.user().iter().any(|u| u.role == "admin") {
        return Err("An admin already exists. Use promote_to_admin.".into());
    }

    if !is_valid_username(&username) {
        return Err("Invalid username".into());
    }
    if password.len() < PASSWORD_MIN {
        return Err("Password too short".into());
    }

    let lower = username.to_lowercase();
    if ctx.db.user().username_lower().find(&lower).is_some() {
        return Err("Username is already taken".into());
    }

    let mut rng = ctx.rng();
    let hash = hash_password_with_rng(&mut rng, &password)?;
    ctx.db.user().insert(User {
        identity: ctx.sender(),
        username_lower: lower,
        username,
        password_hash: hash,
        role: "admin".into(),
        current_level_cap: 18,
        created_at: ctx.timestamp,
    });
    Ok(())
}

#[reducer]
pub fn promote_to_admin(ctx: &ReducerContext, target: Identity) -> Result<(), String> {
    let me = ctx
        .db
        .user()
        .identity()
        .find(ctx.sender())
        .ok_or_else(|| "Not authenticated".to_string())?;
    if me.role != "admin" {
        return Err("Only admins can promote users".into());
    }
    let target_user = ctx
        .db
        .user()
        .identity()
        .find(target)
        .ok_or_else(|| "Target user not found".to_string())?;
    ctx.db.user().identity().update(User {
        role: "admin".into(),
        current_level_cap: 18,
        ..target_user
    });
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin / Settings helpers
// ─────────────────────────────────────────────────────────────────────────────

fn require_admin(ctx: &ReducerContext) -> Result<User, String> {
    let u = ctx
        .db
        .user()
        .identity()
        .find(ctx.sender())
        .ok_or_else(|| "Not authenticated".to_string())?;
    if u.role != "admin" {
        return Err("Only admins can perform this action".to_string());
    }
    Ok(u)
}

fn require_user(ctx: &ReducerContext) -> Result<User, String> {
    ctx.db
        .user()
        .identity()
        .find(ctx.sender())
        .ok_or_else(|| "Not authenticated".to_string())
}

fn max_active_level(ctx: &ReducerContext) -> u32 {
    ctx.db
        .verb()
        .iter()
        .filter(|v| v.active)
        .map(|v| v.level_group)
        .max()
        .unwrap_or(1)
}

const TIME_LIMIT_MIN: u32 = 60;
const TIME_LIMIT_MAX: u32 = 300;
const VERBS_PER_LEVEL_MIN: u32 = 5;
const VERBS_PER_LEVEL_MAX: u32 = 25;

#[reducer]
pub fn update_app_settings(
    ctx: &ReducerContext,
    time_limit_seconds: u32,
    verbs_per_level: u32,
) -> Result<(), String> {
    let admin = require_admin(ctx)?;

    if !(TIME_LIMIT_MIN..=TIME_LIMIT_MAX).contains(&time_limit_seconds) {
        return Err(format!(
            "time_limit_seconds must be between {} and {}",
            TIME_LIMIT_MIN, TIME_LIMIT_MAX
        ));
    }
    if !(VERBS_PER_LEVEL_MIN..=VERBS_PER_LEVEL_MAX).contains(&verbs_per_level) {
        return Err(format!(
            "verbs_per_level must be between {} and {}",
            VERBS_PER_LEVEL_MIN, VERBS_PER_LEVEL_MAX
        ));
    }

    let current = ctx
        .db
        .app_setting()
        .id()
        .find(1)
        .ok_or_else(|| "app_setting row missing".to_string())?;
    ctx.db.app_setting().id().update(AppSetting {
        time_limit_seconds,
        verbs_per_level,
        updated_at: ctx.timestamp,
        updated_by: admin.identity,
        ..current
    });
    Ok(())
}

#[reducer]
pub fn set_active_verb_category(
    ctx: &ReducerContext,
    category: u32,
) -> Result<(), String> {
    let _admin = require_admin(ctx)?;

    if !(1..=3).contains(&category) {
        return Err("Invalid category. Allowed values are 1, 2, or 3".into());
    }

    // Swap active flags atomically: only rows in the chosen category remain active.
    let to_update: Vec<Verb> = ctx
        .db
        .verb()
        .iter()
        .filter(|v| v.active != (v.category == category))
        .collect();
    for v in to_update {
        let should_be_active = v.category == category;
        ctx.db.verb().id().update(Verb {
            active: should_be_active,
            ..v
        });
    }

    let max_level = max_active_level(ctx);

    // Clamp users whose current_level_cap exceeds the new max.
    let to_clamp: Vec<User> = ctx
        .db
        .user()
        .iter()
        .filter(|u| u.current_level_cap > max_level)
        .collect();
    for u in to_clamp {
        ctx.db.user().identity().update(User {
            current_level_cap: max_level.max(1),
            ..u
        });
    }

    let current = ctx
        .db
        .app_setting()
        .id()
        .find(1)
        .ok_or_else(|| "app_setting row missing".to_string())?;
    ctx.db.app_setting().id().update(AppSetting {
        active_verb_category: category,
        updated_at: ctx.timestamp,
        updated_by: ctx.sender(),
        ..current
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Game flow: submit_level_attempt
//
// The reducer returns `Result<(), String>`. The response payload that the
// Supabase RPC returned (status + top_scores) is exposed to clients via
// the `last_attempt_*` columns on the User table — clients subscribe to
// their own row and read the fields after the reducer call resolves.
// ─────────────────────────────────────────────────────────────────────────────

#[table(accessor = user_attempt, public)]
pub struct UserAttempt {
    #[primary_key]
    pub identity: Identity,
    pub last_status: String,    // "unlocked" | "maintained" | "downgraded" | "rejected"
    pub last_new_level: u32,
    pub last_completed_at: Timestamp,
}

const ANTI_CHEAT_MIN_SECONDS_PER_QUESTION: f64 = 0.8;

#[reducer]
pub fn submit_level_attempt(
    ctx: &ReducerContext,
    level_id: u32,
    start_time_iso: String,
    end_time_iso: String,
    error_count: u32,
    questions_count: u32,
) -> Result<(), String> {
    let user = require_user(ctx)?;

    let settings = ctx
        .db
        .app_setting()
        .id()
        .find(1)
        .ok_or_else(|| "app_setting row missing".to_string())?;

    let max_level = max_active_level(ctx).max(1);
    if level_id < 1 || level_id > max_level {
        return Err("Invalid level attempt for active verb list".into());
    }

    let start_time = parse_iso_to_timestamp(&start_time_iso)?;
    let end_time = parse_iso_to_timestamp(&end_time_iso)?;
    if end_time < start_time {
        return Err("end_time must be after start_time".into());
    }
    let duration_micros = (end_time.to_micros_since_unix_epoch()
        - start_time.to_micros_since_unix_epoch())
        .max(0);
    let duration_seconds = (duration_micros / 1_000_000) as u32;

    let anti_cheat_min_seconds = (questions_count as f64) * ANTI_CHEAT_MIN_SECONDS_PER_QUESTION;
    if (duration_seconds as f64) < anti_cheat_min_seconds {
        return Err("Anti-cheat triggered: Completion time physically impossible".into());
    }

    let on_time = duration_seconds <= settings.time_limit_seconds;
    let no_errors = error_count == 0;
    let is_perfect = on_time && no_errors;

    ctx.db.game_session().insert(GameSession {
        id: 0,
        user_identity: user.identity,
        level_attempted: level_id,
        errors_count: error_count,
        duration_seconds,
        completed_at: ctx.timestamp,
        is_perfect_run: is_perfect,
        client_timestamp_start: start_time,
        client_timestamp_end: end_time,
    });

    let (new_cap, status) = if is_perfect {
        let candidate = user
            .current_level_cap
            .max(level_id + 1)
            .min(max_level);
        (candidate, "unlocked")
    } else if on_time {
        (user.current_level_cap.min(max_level), "maintained")
    } else {
        let candidate = user
            .current_level_cap
            .saturating_sub(1)
            .max(1)
            .min(max_level);
        (candidate, "downgraded")
    };

    if new_cap != user.current_level_cap {
        ctx.db.user().identity().update(User {
            current_level_cap: new_cap,
            ..user
        });
    }

    // Persist the attempt result so clients can read it from a subscription.
    if let Some(existing) = ctx.db.user_attempt().identity().find(user.identity) {
        ctx.db.user_attempt().identity().update(UserAttempt {
            last_status: status.to_string(),
            last_new_level: new_cap,
            last_completed_at: ctx.timestamp,
            ..existing
        });
    } else {
        ctx.db.user_attempt().insert(UserAttempt {
            identity: user.identity,
            last_status: status.to_string(),
            last_new_level: new_cap,
            last_completed_at: ctx.timestamp,
        });
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Verbs CRUD (admin only for inserts / flag changes)
// ─────────────────────────────────────────────────────────────────────────────

#[reducer]
pub fn upsert_verb(
    ctx: &ReducerContext,
    infinitive: String,
    past_simple: String,
    past_participle: String,
    level_group: u32,
    category: u32,
    active: bool,
) -> Result<(), String> {
    require_admin(ctx)?;

    if !(1..=3).contains(&category) {
        return Err("category must be 1, 2 or 3".into());
    }
    if infinitive.is_empty() || past_simple.is_empty() || past_participle.is_empty() {
        return Err("infinitive, past_simple and past_participle are required".into());
    }
    if level_group == 0 {
        return Err("level_group must be >= 1".into());
    }

    let existing = ctx.db.verb().iter().find(|v| {
        v.infinitive == infinitive && v.level_group == level_group && v.category == category
    });

    match existing {
        Some(v) => {
            ctx.db.verb().id().update(Verb {
                past_simple,
                past_participle,
                active,
                ..v
            });
        }
        None => {
            ctx.db.verb().insert(Verb {
                id: 0,
                level_group,
                category,
                infinitive,
                past_simple,
                past_participle,
                active,
            });
        }
    }
    Ok(())
}

#[reducer]
pub fn delete_verb(ctx: &ReducerContext, id: u64) -> Result<(), String> {
    require_admin(ctx)?;
    ctx.db.verb().id().delete(id);
    Ok(())
}

#[reducer]
pub fn truncate_verbs(ctx: &ReducerContext) -> Result<(), String> {
    require_admin(ctx)?;
    let ids: Vec<u64> = ctx.db.verb().iter().map(|v| v.id).collect();
    for id in ids {
        ctx.db.verb().id().delete(id);
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only procedures (replacement for the Supabase SECURITY DEFINER RPCs).
//
// Procedures have no direct DB access; they open a transaction via `with_tx`
// which provides a `&TxContext` that derefs to `&ReducerContext`, giving
// full read/write access inside a single transaction.
// ─────────────────────────────────────────────────────────────────────────────

#[procedure]
pub fn get_users_overview(ctx: &mut ProcedureContext) -> Vec<UserOverview> {
    ctx.with_tx(|tx| {
        let mut rows: Vec<UserOverview> = Vec::new();
        for user in tx.db.user().iter().filter(|u| u.role == "student") {
            let mut total_runs: u64 = 0;
            let mut total_perfect: u64 = 0;
            for session in tx.db.game_session().user_identity().filter(user.identity) {
                total_runs += 1;
                if session.is_perfect_run {
                    total_perfect += 1;
                }
            }
            rows.push(UserOverview {
                user_identity: user.identity.to_hex().to_string(),
                username: user.username,
                current_level_cap: user.current_level_cap,
                total_runs,
                total_perfect_runs: total_perfect,
            });
        }
        rows.sort_by(|a, b| {
            b.current_level_cap
                .cmp(&a.current_level_cap)
                .then(b.total_perfect_runs.cmp(&a.total_perfect_runs))
        });
        rows
    })
}

#[procedure]
pub fn get_user_level_details(
    ctx: &mut ProcedureContext,
    target: Identity,
) -> Vec<UserLevelDetail> {
    ctx.with_tx(|tx| {
        let mut per_level_totals: std::collections::BTreeMap<u32, (u64, u64)> =
            std::collections::BTreeMap::new();
        for session in tx.db.game_session().user_identity().filter(target) {
            let entry = per_level_totals
                .entry(session.level_attempted)
                .or_insert((0, 0));
            entry.0 += 1;
            if session.is_perfect_run {
                entry.1 += 1;
            }
        }

        let mut best_times: std::collections::BTreeMap<u32, u32> =
            std::collections::BTreeMap::new();
        for session in tx
            .db
            .game_session()
            .user_identity()
            .filter(target)
            .filter(|s| s.is_perfect_run)
        {
            let entry = best_times
                .entry(session.level_attempted)
                .or_insert(u32::MAX);
            if session.duration_seconds < *entry {
                *entry = session.duration_seconds;
            }
        }

        let mut level_bests: std::collections::BTreeMap<u32, Vec<(u32, Identity)>> =
            std::collections::BTreeMap::new();
        for session in tx.db.game_session().iter().filter(|s| s.is_perfect_run) {
            level_bests
                .entry(session.level_attempted)
                .or_default()
                .push((session.duration_seconds, session.user_identity));
        }
        for entries in level_bests.values_mut() {
            entries.sort_by_key(|(t, _)| *t);
        }

        per_level_totals
            .into_iter()
            .map(|(level, (total, perfect))| {
                let best_time = best_times.get(&level).copied();
                let global_rank = best_time.and_then(|_| {
                    level_bests.get(&level).and_then(|entries| {
                        entries
                            .iter()
                            .position(|(_, id)| *id == target)
                            .map(|p| p as u64 + 1)
                    })
                });
                UserLevelDetail {
                    level_attempted: level,
                    total_runs: total,
                    perfect_runs: perfect,
                    best_time_seconds: best_time,
                    global_rank,
                }
            })
            .collect()
    })
}

#[procedure]
pub fn get_user_level_runs(
    ctx: &mut ProcedureContext,
    target: Identity,
    level: u32,
) -> LevelRunsResponse {
    ctx.with_tx(|tx| {
        let mut runs: Vec<LevelRunDetail> = tx
            .db
            .game_session()
            .iter()
            .filter(|s| s.user_identity == target && s.level_attempted == level)
            .map(|s| LevelRunDetail {
                duration_seconds: s.duration_seconds,
                is_perfect_run: s.is_perfect_run,
                completed_at: s.completed_at,
                errors_count: s.errors_count,
                client_timestamp_start: s.client_timestamp_start,
            })
            .collect();
        runs.sort_by(|a, b| b.client_timestamp_start.cmp(&a.client_timestamp_start));

        let mut verbs: Vec<LevelVerbDetail> = tx
            .db
            .verb()
            .iter()
            .filter(|v| v.level_group == level && v.active)
            .map(|v| LevelVerbDetail {
                id: v.id,
                infinitive: v.infinitive,
                past_simple: v.past_simple,
                past_participle: v.past_participle,
            })
            .collect();
        verbs.sort_by(|a, b| a.infinitive.cmp(&b.infinitive));

        LevelRunsResponse { runs, verbs }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO 8601 timestamp parsing
//
// SpacetimeDB Timestamps are microseconds since UNIX epoch. The web client
// sends ISO-8601 strings; we parse them server-side so the client can stay
// in JS Date semantics. We accept RFC3339 / ISO8601 with or without
// fractional seconds and timezone designator.
// ─────────────────────────────────────────────────────────────────────────────

fn parse_iso_to_timestamp(s: &str) -> Result<Timestamp, String> {
    let s = s.trim();
    if s.len() < 19 {
        return Err(format!("Invalid ISO timestamp: {s}"));
    }

    let bytes = s.as_bytes();
    let check = |i: usize, c: &u8| match i {
        0 | 1 | 2 | 3 | 5 | 6 | 8 | 9 | 11 | 12 | 14 | 15 | 17 | 18 => c.is_ascii_digit(),
        4 | 7 | 13 | 16 => matches!(c, b'-' | b'T' | b':'),
        _ => false,
    };
    if !(0..19).all(|i| check(i, &bytes[i])) {
        return Err(format!("Invalid ISO timestamp: {s}"));
    }

    let year: i32 = s[0..4].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let month: u32 = s[5..7].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let day: u32 = s[8..10].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let hour: u32 = s[11..13].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let minute: u32 = s[14..16].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
    let second: u32 = s[17..19].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;

    let rest = &s[19..];
    let (frac_micros, tz_offset) = parse_iso_tail(rest)?;

    if !(1..=12).contains(&month) || day > 31 || hour > 23 || minute > 59 || second > 60 {
        return Err(format!("Invalid ISO timestamp components: {s}"));
    }

    let days_from_epoch = days_from_civil(year, month as i32, day as i32);
    let seconds_in_day = hour as i64 * 3600 + minute as i64 + second as i64;
    let epoch_seconds = days_from_epoch * 86_400 + seconds_in_day - tz_offset;
    let epoch_micros = epoch_seconds * 1_000_000 + frac_micros as i64;
    let epoch_micros = if epoch_micros < 0 { 0 } else { epoch_micros };
    Ok(Timestamp::from_micros_since_unix_epoch(epoch_micros))
}

fn parse_iso_tail(s: &str) -> Result<(u32, i64), String> {
    let mut frac_micros: u32 = 0;
    let tz_offset_seconds: i64;

    if let Some(after_dot) = s.strip_prefix('.') {
        let digits: String = after_dot
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if digits.is_empty() {
            return Err("Invalid fractional seconds".into());
        }
        let pad = 6 - digits.len() as u32;
        let n: u32 = digits.parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
        frac_micros = n * 10u32.pow(pad);
        let rest = &after_dot[digits.len()..];
        tz_offset_seconds = parse_tz_offset(rest)?;
    } else {
        tz_offset_seconds = parse_tz_offset(s)?;
    }
    Ok((frac_micros, tz_offset_seconds))
}

fn parse_tz_offset(s: &str) -> Result<i64, String> {
    let s = s.trim();
    if s.is_empty() || s == "Z" || s == "z" {
        return Ok(0);
    }
    if s.starts_with('+') || s.starts_with('-') {
        let sign: i64 = if s.starts_with('-') { -1 } else { 1 };
        let rest = &s[1..];
        if rest.len() != 5 || rest.as_bytes()[2] != b':' {
            return Err(format!("Invalid timezone offset: {s}"));
        }
        let h: i64 = rest[0..2].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
        let m: i64 = rest[3..5].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
        return Ok(sign * (h * 3600 + m * 60));
    }
    Err(format!("Invalid timezone designator: {s}"))
}

// Howard Hinnant's date_days_from_civil algorithm — converts (y, m, d) to
// days since 1970-01-01 (UNIX epoch).
fn days_from_civil(y: i32, m: i32, d: i32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let m = m as i64;
    let d = d as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    (era as i64) * 146_097 + doe - 719_468
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand::rngs::StdRng;

    #[test]
    fn is_valid_username_accepts_alphanumeric_underscore() {
        assert!(is_valid_username("player_1"));
        assert!(!is_valid_username("ab"));
        assert!(!is_valid_username("bad name"));
    }

    #[test]
    fn verify_password_accepts_matching_hash() {
        let mut rng = StdRng::seed_from_u64(42);
        let hash = hash_password_with_rng(&mut rng, "secret12").expect("hash");
        assert!(verify_password("secret12", &hash));
        assert!(!verify_password("wrong", &hash));
    }

    #[test]
    fn validate_google_claims_accepts_matching_issuer_and_audience() {
        let client_id = "test-client.apps.googleusercontent.com";
        let payload = format!(
            r#"{{"iss":"https://accounts.google.com","sub":"123","aud":"{client_id}"}}"#
        );
        let auth = spacetimedb::AuthCtx::from_jwt_payload(payload);
        let claims = auth.jwt().expect("claims");
        assert!(validate_google_claims(claims, client_id).is_ok());
    }

    #[test]
    fn validate_google_claims_rejects_wrong_audience_and_issuer() {
        let client_id = "test-client.apps.googleusercontent.com";

        let wrong_aud = spacetimedb::AuthCtx::from_jwt_payload(
            r#"{"iss":"https://accounts.google.com","sub":"1","aud":"someone-else"}"#.to_string(),
        );
        assert!(validate_google_claims(wrong_aud.jwt().unwrap(), client_id).is_err());

        let wrong_iss = spacetimedb::AuthCtx::from_jwt_payload(format!(
            r#"{{"iss":"https://evil.example.com","sub":"1","aud":"{client_id}"}}"#
        ));
        assert!(validate_google_claims(wrong_iss.jwt().unwrap(), client_id).is_err());
    }
}